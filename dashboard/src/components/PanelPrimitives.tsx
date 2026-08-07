import { useState, useEffect, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MarkdownContent } from './MarkdownContent'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { showError, showSuccess, errorMessage } from '../lib/toast'
import { useDrillDown } from '../contexts/DrillDownContext'
import type { Agent, Version, Decision } from '../lib/types'
import { ageSince } from '../lib/utils'
import { useSSE } from '../contexts/SSEContext'
import { StatusBadge, VersionBadge, ProjectPill } from './Badges'
import { CopyButton } from './CopyButton'

// ── Agent Panel ───────────────────────────────────────────────────────────────

export function AgentPanel() {
  const { data: agents = [] } = useQuery({ queryKey: QK.agents(), queryFn: api.agents, refetchInterval: 30_000 })
  const [, forceRender] = useState(0)

  // Re-render every 30s so "last seen" ages update
  useEffect(() => {
    const t = setInterval(() => forceRender(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const now = Math.floor(Date.now() / 1000)

  return (
    <Panel title="Agents" count={agents.length}>
      {agents.length === 0
        ? <EmptyRow cols={4} msg="No agents registered" />
        : (
          <table className="w-full border-collapse">
            <thead>
              <Tr header>
                <Th>Agent</Th><Th>Status</Th><Th>Working On</Th><Th className="col-lastseen">Last Seen</Th>
              </Tr>
            </thead>
            <tbody>
              {agents.map(a => <AgentRow key={a.id} agent={a} now={now} />)}
            </tbody>
          </table>
        )
      }
    </Panel>
  )
}

function AgentRow({ agent: a, now }: { agent: Agent; now: number }) {
  const age = now - a.last_heartbeat
  const isLive = age < 120
  const dotColor = isLive ? 'var(--green)' : age < 600 ? 'var(--yellow)' : 'var(--red)'
  const dotShadow = isLive ? '0 0 4px var(--green)' : undefined
  const statusLabel = isLive ? 'live' : age < 600 ? 'stale' : 'offline'

  return (
    <tr>
      <Td>
        {a.current_task
          ? <span className="agent-working inline-block mr-[6px] text-green text-sm leading-none" />
          : <span className="inline-block w-[7px] h-[7px] rounded-full mr-[6px] flex-shrink-0"
              style={{ background: dotColor, boxShadow: dotShadow }} />
        }
        {a.id}
      </Td>
      <Td muted small>{statusLabel}</Td>
      <Td className="text-cyan text-xs">{a.current_task ? `#${a.current_task}` : 'idle'}</Td>
      <Td muted small className="col-lastseen">{ageSince(age)}</Td>
    </tr>
  )
}

// ── Event Feed ────────────────────────────────────────────────────────────────

export function EventFeed() {
  const { events } = useSSE()

  const EVENT_COLORS: Record<string, string> = {
    task_claimed:     'text-cyan',
    task_completed:   'text-green',
    task_blocked:     'text-red',
    heartbeat:        'text-muted',
    task_created:     'text-blue',
    epic_created:     'text-purple',
    agent_registered: 'text-yellow',
    task_github_linked: 'text-purple',
    version_created:  'text-blue',
  }

  return (
    <div>
      <SectionLabel>Live event feed</SectionLabel>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="font-mono text-[11px] max-h-[220px] overflow-y-auto px-4 py-[6px]">
          {events.length === 0
            ? <div className="text-center text-muted py-5 text-xs">Waiting for events…</div>
            : events.map(ev => (
                <div key={ev.id}
                  className="flex gap-[10px] py-[3px] border-b border-[rgba(30,39,50,0.8)] last:border-0"
                  style={{ animation: 'fadeIn 0.3s ease' }}>
                  <span className="text-muted min-w-[72px]">{new Date(ev.ts * 1000).toLocaleTimeString()}</span>
                  {ev.project && ev.project !== 'default' && <ProjectPill name={ev.project} />}
                  <span className={`min-w-[140px] ${EVENT_COLORS[ev.type] ?? 'text-muted'}`}>{ev.type}</span>
                  <span className="text-muted">
                    {ev.agent_id
                      ? (ev.task_id ? `${ev.agent_id} → task #${ev.task_id}` : ev.agent_id)
                      : (ev.task_id ? `task #${ev.task_id}` : '')}
                  </span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  )
}

// ── Decision Panel ────────────────────────────────────────────────────────────

interface DecisionPanelProps {
  loadedEpicIds: number[]
  decisionsOpenCount: number
}

export function DecisionPanel({ loadedEpicIds, decisionsOpenCount }: DecisionPanelProps) {
  const { drillDown, setDrillDown } = useDrillDown()

  // Collect decisions from all loaded epics
  const queries = loadedEpicIds.map(id =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({ queryKey: QK.epicDecs(id), queryFn: () => api.epicDecisions(id) })
  )
  const allDecisions = queries.flatMap(q => q.data ?? [])

  if (!allDecisions.length && !decisionsOpenCount) return null

  return (
    <div>
      <SectionLabel>Decisions</SectionLabel>
      <Panel title="Decisions" count={allDecisions.length || undefined}>
        {!allDecisions.length
          ? <EmptyRow cols={4} msg="Expand an epic above to see its decisions" />
          : (
            <table className="w-full border-collapse">
              <thead>
                <Tr header><Th>ID</Th><Th>Title</Th><Th>Epic</Th><Th>Status</Th></Tr>
              </thead>
              <tbody>
                {allDecisions.map(d => (
                   <DecisionRow key={d.id} decision={d}
                     expanded={drillDown?.type === 'decision' && drillDown.id === d.id}
                     onToggle={() => setDrillDown(
                       drillDown?.type === 'decision' && drillDown.id === d.id
                         ? (d.epic_id ? { type: 'epic', id: d.epic_id } : null)
                         : { type: 'decision', id: d.id, epicId: d.epic_id }
                     )} />
                ))}
              </tbody>
            </table>
          )
        }
      </Panel>
    </div>
  )
}

// ── Decision Row (with resolve/reject actions) ────────────────────────────────

function DecisionRow({ decision: d, expanded, onToggle }: {
  decision: Decision
  expanded: boolean
  onToggle: () => void
}) {
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)

  function invalidate() {
    if (d.epic_id) qc.invalidateQueries({ queryKey: QK.epicDecs(d.epic_id) })
    qc.invalidateQueries({ queryKey: QK.stats() })
  }

  const resolveMut = useMutation({
    mutationFn: () => api.resolveDecision(d.id),
    onSuccess: () => { invalidate(); setMenuOpen(false); showSuccess(`Decision #${d.id} resolved`) },
    onError: (err) => showError(errorMessage(err)),
  })

  const rejectMut = useMutation({
    mutationFn: () => api.rejectDecision(d.id),
    onSuccess: () => { invalidate(); setMenuOpen(false); showSuccess(`Decision #${d.id} rejected`) },
    onError: (err) => showError(errorMessage(err)),
  })

  const isPending = resolveMut.isPending || rejectMut.isPending
  const isOpen = d.status === 'open'

  return (
    <>
      <tr
        id={`decision-row-${d.id}`}
        className={`cursor-pointer hover:[&>td]:bg-white/[0.025] ${expanded ? '[&>td]:bg-[rgba(31,111,235,0.07)] [&>td:first-child]:border-l-2 [&>td:first-child]:border-accent' : ''}`}
        onClick={onToggle}
      >
        <Td mono muted><CopyButton type="decision" id={d.id} title={d.title} />#{d.id}</Td>
        <Td bold>{d.title}</Td>
        <Td muted small>{d.epic_id ? `#${d.epic_id}` : '—'}</Td>
        <Td>
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={d.status} />
            {isOpen && (
              <span className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  disabled={isPending}
                  title="Close decision"
                  className="text-[10px] text-muted hover:text-accent bg-transparent border border-muted/30 hover:border-accent/60 rounded px-[6px] py-[2px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  {isPending ? '…' : 'Close ▾'}
                </button>
                {menuOpen && (
                  <span className="absolute right-0 top-full mt-1 z-50 flex flex-col bg-card border border-border rounded shadow-lg min-w-[110px]">
                    <button
                      onClick={() => resolveMut.mutate()}
                      disabled={isPending}
                      className="text-left text-[11px] px-3 py-[6px] text-green hover:bg-surface disabled:opacity-40 cursor-pointer">
                      ✓ Resolve
                    </button>
                    <button
                      onClick={() => rejectMut.mutate()}
                      disabled={isPending}
                      className="text-left text-[11px] px-3 py-[6px] text-red hover:bg-surface disabled:opacity-40 cursor-pointer">
                      ✕ Reject
                    </button>
                  </span>
                )}
              </span>
            )}
          </span>
        </Td>
      </tr>
      {expanded && (
        <tr className="[&>td]:p-0 [&>td]:border-b [&>td]:border-border">
          <td colSpan={4}>
            <div className="p-[14px_20px] bg-background border-t border-border text-[13px] flex flex-col gap-[10px]">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">Content</span>
                {d.content
                  ? <MarkdownContent>{d.content}</MarkdownContent>
                  : <span className="text-muted italic text-xs">No content</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}



// ── Version Panel ─────────────────────────────────────────────────────────────

export function VersionPanel() {
  const { currentProject } = useDrillDown()
  const { data: versions = [] } = useQuery({ queryKey: QK.versions(currentProject), queryFn: () => api.versions(currentProject) })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [diffFrom, setDiffFrom] = useState<string>('')

  if (!versions.length) return null

  const sorted = [...versions].reverse()

  return (
    <div>
      <SectionLabel>Versions — click to expand</SectionLabel>
      <Panel title="Versions" count={versions.length}>
        <table className="w-full border-collapse">
          <thead>
            <Tr header><Th>ID</Th><Th>Name</Th><Th>Tasks</Th><Th>Description</Th><Th>Tagged</Th></Tr>
          </thead>
          <tbody>
            {sorted.map(v => {
              const now = Math.floor(Date.now() / 1000)
              const expanded = expandedId === v.id
              return (
                <>
                  <tr key={v.id}
                    className={`cursor-pointer hover:[&>td]:bg-white/[0.025] ${expanded ? '[&>td]:bg-[rgba(31,111,235,0.07)]' : ''}`}
                    onClick={() => { setExpandedId(expanded ? null : v.id); setDiffFrom('') }}
                  >
                    <Td mono muted>#{v.id}</Td>
                    <Td><VersionBadge name={v.name} /></Td>
                    <Td muted small>{v.task_count}</Td>
                    <Td muted small className="max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap">{v.description || '—'}</Td>
                    <Td muted small>{ageSince(now - v.created_at)}</Td>
                  </tr>
                  {expanded && (
                    <VersionDetailRow key={`${v.id}-detail`} version={v} versions={versions} diffFrom={diffFrom} setDiffFrom={setDiffFrom} />
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

function VersionDetailRow({ version: v, versions, diffFrom, setDiffFrom }: {
  version: Version; versions: Version[]; diffFrom: string; setDiffFrom: (s: string) => void
}) {
  const others = versions.filter((x: Version) => x.id !== v.id)
  const { data: ownTasks } = useQuery({
    queryKey: ['versionTasks', v.id],
    queryFn: () => api.versionDiff(v.project, v.name),
  })
  const { data: diffData } = useQuery({
    queryKey: ['versionDiff', v.id, diffFrom],
    queryFn: () => api.versionDiff(v.project, v.name, diffFrom),
    enabled: !!diffFrom,
  })

  return (
    <tr className="[&>td]:p-0 [&>td]:border-b [&>td]:border-border">
      <td colSpan={5}>
        <div className="p-[14px_20px] bg-background border-t border-border text-[13px] flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">Tasks in this version</span>
            <div className="flex flex-wrap gap-1">
              {!ownTasks ? <span className="text-muted italic text-xs">Loading…</span>
                : ownTasks.tasks.length === 0 ? <span className="text-muted italic text-xs">No tasks captured</span>
                : ownTasks.tasks.map(t => (
                    <span key={t.id} className="inline-block bg-surface border border-border2 rounded px-2 py-[2px] text-[11px] text-blue">
                      #{t.id} {t.title} <StatusBadge status={t.status} />
                    </span>
                  ))
              }
            </div>
          </div>
          {others.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted uppercase tracking-wide font-semibold">Diff vs:</span>
                <select value={diffFrom} onChange={e => setDiffFrom(e.target.value)}
                  className="bg-surface text-foreground border border-border2 rounded px-2 py-[3px] text-xs">
                  <option value="">— choose version —</option>
                  {others.map((o: Version) => <option key={o.id} value={o.name}>{o.name}{o.description ? ` — ${o.description}` : ''}</option>)}
                </select>
              </div>
              {diffFrom && diffData && (
                <div className="text-xs text-muted">
                  {diffData.tasks.length === 0
                    ? 'No new tasks between these versions'
                    : diffData.tasks.map(t => (
                        <span key={t.id} className="inline-block mr-1 mb-1 bg-[rgba(63,185,80,0.1)] border border-[rgba(63,185,80,0.35)] text-green rounded px-2 py-[2px] text-[11px]">
                          + #{t.id} {t.title}
                        </span>
                      ))
                  }
                </div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Shared layout primitives ──────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-cyan mb-[10px] flex items-center gap-2 after:flex-1 after:h-px after:bg-border">
      {children}
    </div>
  )
}

export function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-[10px] border-b border-border flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
        {title}
        {count !== undefined && (
          <span className="bg-border2 text-foreground text-[10px] px-[6px] py-[1px] rounded-full font-semibold">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

export function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="text-center text-muted text-xs py-5 px-4">{msg}</td></tr>
}

function Tr({ children, header }: { children: React.ReactNode; header?: boolean }) {
  if (header) return <tr>{children}</tr>
  return <tr className="cursor-pointer hover:[&>td]:bg-white/[0.025]">{children}</tr>
}

function Th({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface ${className}`}>
      {children}
    </th>
  )
}

interface TdProps {
  children?: React.ReactNode
  className?: string
  mono?: boolean
  muted?: boolean
  small?: boolean
  bold?: boolean
}

export function Td({ children, className = '', mono, muted, small, bold }: TdProps) {
  return (
    <td className={`px-4 py-[9px] border-b border-border align-middle
      ${mono ? 'font-mono text-xs' : ''}
      ${muted ? 'text-muted' : ''}
      ${small ? 'text-xs' : ''}
      ${bold ? 'font-medium' : ''}
      ${className}`}>
      {children}
    </td>
  )
}
