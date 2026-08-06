import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MarkdownContent } from './MarkdownContent'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { useDrillDown } from '../contexts/DrillDownContext'
import type { Epic, Task } from '../lib/types'
import { StatusBadge, TaskTypeBadge, VerificationBadge, TestingBadge, ProjectPill } from './Badges'
import { CopyButton } from './CopyButton'
import { SectionLabel, EmptyRow } from './PanelPrimitives'
import { projectHue } from '../lib/utils'
import { TaskDrawer } from './TaskDrawer'
import { TaskCreateDrawer } from './TaskCreateDrawer'
import { showError, showSuccess, errorMessage } from '../lib/toast'

type SortCol = 'id' | 'project' | 'title' | 'status' | 'progress'
type SortDir = 'asc' | 'desc'

export function EpicTable() {
  const { currentProject, drillDown, setDrillDown } = useDrillDown()
  const { data: openEpics = [] } = useQuery({
    queryKey: QK.epics(currentProject, 'open'),
    queryFn: () => api.epics(currentProject, 'open'),
  })
  const { data: stats } = useQuery({
    queryKey: QK.stats(currentProject),
    queryFn: () => api.stats(currentProject),
  })

  const [sortCol, setSortCol] = useState<SortCol>('id')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [epicFilter, setEpicFilter] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [closedEpics, setClosedEpics] = useState<Epic[] | null>(null)
  const [loadingClosed, setLoadingClosed] = useState(false)

  // Expose kpiClick for parent to call
  // (parent passes epicFilter state down via props in the real integration)

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'id' || col === 'progress' ? 'desc' : 'asc') }
  }

  function openWork(e: Epic) {
    return (e.task_count - e.done_count) + (e.decisions_open_count ?? 0)
  }

  function applyFilter(epics: Epic[]) {
    if (!epicFilter) return epics
    return epics.filter(e => {
      if (epicFilter === 'tasks_open')     return (e.task_count - e.done_count) > 0
      if (epicFilter === 'tasks_done')     return e.done_count > 0
      if (epicFilter === 'tasks_total')    return e.task_count > 0
      if (epicFilter === 'decisions_open') return (e.decisions_open_count ?? 0) > 0
      return true
    })
  }

  function applySort(epics: Epic[]) {
    return [...epics].sort((a, b) => {
      let av: number | string, bv: number | string
      if (sortCol === 'progress') { av = openWork(a); bv = openWork(b) }
      else if (sortCol === 'id')  { av = a.id; bv = b.id }
      else                         { av = (a[sortCol as keyof Epic] as string ?? '').toLowerCase(); bv = (b[sortCol as keyof Epic] as string ?? '').toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }

  async function toggleArchive() {
    setArchiveOpen(o => !o)
    if (!archiveOpen && closedEpics === null && !loadingClosed) {
      setLoadingClosed(true)
      try {
        const closed = await api.epics(currentProject, 'closed')
        setClosedEpics(closed)
      } finally {
        setLoadingClosed(false)
      }
    }
  }

  const sorted = applySort(applyFilter(openEpics))
  const closedCount = stats?.closed_epic_count ?? 0

  function SortTh({ col, children, className = '' }: { col: SortCol; children: React.ReactNode; className?: string }) {
    const active = sortCol === col
    const arrow = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'
    return (
      <th onClick={() => handleSort(col)}
        className={`text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface cursor-pointer select-none hover:text-foreground ${className}`}>
        {children}
        <span className={`ml-1 text-[9px] ${active ? 'opacity-100 text-cyan' : 'opacity-40'}`}>{arrow}</span>
      </th>
    )
  }

  return (
    <div>
      <SectionLabel>Epics — click to expand</SectionLabel>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-[10px] border-b border-border flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
          Epics
          <span className="bg-border2 text-foreground text-[10px] px-[6px] py-[1px] rounded-full font-semibold">{openEpics.length}</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <SortTh col="id">ID</SortTh>
              <SortTh col="project" className="col-epic-project">Project</SortTh>
              <SortTh col="title">Title</SortTh>
              <SortTh col="status">Status</SortTh>
              <SortTh col="progress" className="col-progress">Progress</SortTh>
              <th className="w-8 border-b border-border bg-surface" />
            </tr>
          </thead>
          <tbody>
            {/* Filter banner */}
            {epicFilter && sorted.length < openEpics.length && (
              <tr>
                <td colSpan={6} className="px-4 py-[6px] text-[11px] text-muted bg-surface border-b border-border">
                  Showing {sorted.length} of {openEpics.length} open epics ·{' '}
                  <span className="text-blue cursor-pointer" onClick={() => setEpicFilter(null)}>clear filter</span>
                </td>
              </tr>
            )}
            {sorted.length === 0 && openEpics.length > 0 && (
              <tr><td colSpan={6} className="text-center text-muted text-xs py-5 px-4">
                No epics match this filter ·{' '}
                <span className="text-blue cursor-pointer" onClick={() => setEpicFilter(null)}>clear</span>
              </td></tr>
            )}
            {sorted.length === 0 && openEpics.length === 0 && !closedCount && (
              <EmptyRow cols={6} msg="No epics yet" />
            )}
            {sorted.map(e => (
              <EpicRows key={e.id} epic={e}
                drillDown={drillDown} setDrillDown={setDrillDown} currentProject={currentProject} />
            ))}
            {/* Archive toggle */}
            {closedCount > 0 && (
              <>
                <tr className={`cursor-pointer select-none hover:[&>td]:text-foreground ${archiveOpen ? '[&>td_.toggle]:rotate-90' : ''}`}
                  onClick={toggleArchive}>
                  <td colSpan={6} className="px-4 py-[6px] border-t border-border text-[10px] font-bold text-muted uppercase tracking-[0.06em]">
                    <span className="toggle inline-block mr-[6px] transition-transform">▶</span>
                    Archive — {closedCount} closed epic{closedCount !== 1 ? 's' : ''}
                  </td>
                </tr>
                {archiveOpen && (loadingClosed
                  ? <tr><td colSpan={6} className="text-center text-muted text-xs py-5 px-4">Loading…</td></tr>
                  : (closedEpics ?? []).map(e => (
                      <EpicRows key={e.id} epic={e}
                        drillDown={drillDown} setDrillDown={setDrillDown}
                        currentProject={currentProject} archived />
                    ))
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Single epic row + optional detail row ─────────────────────────────────────

function EpicRows({ epic: e, drillDown, setDrillDown, currentProject, archived = false }: {
  epic: Epic
  drillDown: ReturnType<typeof useDrillDown>['drillDown']
  setDrillDown: ReturnType<typeof useDrillDown>['setDrillDown']
  currentProject: string
  archived?: boolean
}) {
  const qc = useQueryClient()
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [showCreateDrawer, setShowCreateDrawer] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const closeMut = useMutation({
    mutationFn: () => api.closeEpic(e.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.epics() })
      qc.invalidateQueries({ queryKey: QK.stats() })
      showSuccess(`Epic #${e.id} closed`)
      setConfirmClose(false)
    },
    onError: (err) => { showError(errorMessage(err)); setConfirmClose(false) },
  })

  const isExpanded = drillDown && (
    (drillDown.type === 'epic' && drillDown.id === e.id) ||
    (drillDown.type === 'task' && drillDown.epicId === e.id) ||
    (drillDown.type === 'decision' && drillDown.epicId === e.id)
  )

  // Prefetch on expand
  const { data: epicTasks } = useQuery({
    queryKey: QK.epicTasks(e.id),
    queryFn: () => api.epicTasks(e.id),
    enabled: !!isExpanded,
  })
  const { data: epicDecisions } = useQuery({
    queryKey: QK.epicDecs(e.id),
    queryFn: () => api.epicDecisions(e.id),
    enabled: !!isExpanded,
  })

  // Check if any agent is live on this epic
  const { data: agents = [] } = useQuery({ queryKey: QK.agents(), queryFn: api.agents })
  const { data: activeTasks = [] } = useQuery({
    queryKey: QK.tasks(currentProject, 'in_progress'),
    queryFn: () => api.tasks(currentProject, 'in_progress'),
  })
  const epicHasLiveTask = activeTasks.some(t =>
    t.epic_id === e.id && agents.some(a => a.current_task === t.id)
  )

  const tasksDone  = e.done_count ?? 0
  const tasksTotal = e.task_count ?? 0
  const decsOpen   = e.decisions_open_count ?? 0
  const pct        = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0

  const borderColor = isExpanded ? 'var(--cyan)' : 'var(--border2)'

  function toggle() {
    if (isExpanded) setDrillDown(null)
    else {
      setDrillDown({ type: 'epic', id: e.id })
    }
  }

  return (
    <>
      <tr
        className={`cursor-pointer hover:[&>td]:bg-white/[0.025] ${archived ? 'opacity-45 hover:opacity-75' : ''} ${isExpanded ? '[&>td]:bg-[rgba(31,111,235,0.07)]' : ''}`}
        data-epic-id={e.id}
        onClick={toggle}
      >
        <td className="px-4 py-[9px] border-b border-border align-middle font-mono text-xs text-muted"
          style={{ borderLeft: `3px solid ${borderColor}` }}>
          #{e.id}
        </td>
        <td className="px-4 py-[9px] border-b border-border align-middle col-epic-project">
          <ProjectPill name={e.project} />
        </td>
        <td className="px-4 py-[9px] border-b border-border align-middle font-medium">
          {epicHasLiveTask && <span className="agent-working inline-block mr-[6px] text-green text-sm leading-none" />}
          {e.title}
        </td>
        <td className="px-4 py-[9px] border-b border-border align-middle">
          <StatusBadge status={e.status} />
        </td>
        <td className="px-4 py-[9px] border-b border-border align-middle col-progress">
          <div className="flex flex-col gap-1">
            {decsOpen > 0 && (
              <div className="flex items-center gap-[6px]">
                <div className="h-1 bg-border2 rounded-sm overflow-hidden w-20 flex-shrink-0">
                  <span className="block h-full bg-purple" style={{ width: '0%' }} />
                </div>
                <span className="text-[10px] text-muted whitespace-nowrap opacity-60">
                  {decsOpen} open decision{decsOpen !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <div className="flex items-center gap-[6px]">
              <div className="h-1 bg-border2 rounded-sm overflow-hidden w-20 flex-shrink-0">
                <span className="block h-full bg-green transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-muted whitespace-nowrap">
                {pct}% <span className="opacity-60">{tasksDone}/{tasksTotal} tasks</span>
              </span>
            </div>
          </div>
        </td>
        <td className="px-3 py-[9px] border-b border-border align-middle text-right">
          <span className="inline-flex items-center gap-2">
            {!archived && (
              <button
                onClick={ev => { ev.stopPropagation(); setConfirmClose(true) }}
                title="Close epic"
                className="text-[10px] text-muted hover:text-red bg-transparent border-0 cursor-pointer px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                ✕
              </button>
            )}
            <CopyButton type="epic" id={e.id} title={e.title} />
          </span>
        </td>
      </tr>

      {/* Close-epic confirmation dialog */}
      {confirmClose && (
        <tr className="[&>td]:p-0">
          <td colSpan={6}>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-card border border-border rounded-lg p-6 w-[400px] flex flex-col gap-4 shadow-xl">
                <h2 className="text-[15px] font-semibold text-foreground">Close Epic #{e.id}?</h2>
                <p className="text-xs text-muted">
                  "{e.title}" will be moved to the archive. This cannot be undone from the dashboard.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setConfirmClose(false)}
                    disabled={closeMut.isPending}
                    className="px-3 py-[6px] text-xs text-muted hover:text-foreground bg-transparent border border-border2 rounded-md cursor-pointer">
                    Cancel
                  </button>
                  <button onClick={() => closeMut.mutate()}
                    disabled={closeMut.isPending}
                    className="px-3 py-[6px] text-xs text-white bg-red/80 border-0 rounded-md cursor-pointer hover:bg-red disabled:opacity-40 disabled:cursor-not-allowed">
                    {closeMut.isPending ? 'Closing…' : 'Close epic'}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}

      {isExpanded && (
        <tr className="[&>td]:p-0 [&>td]:border-b [&>td]:border-border">
          <td colSpan={6}>
            <div className="p-[14px_20px] bg-background border-t border-border text-[13px] grid grid-cols-2 gap-[10px_24px]">
              {/* Tasks */}
              <div className="col-span-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Tasks</span>
                  <button
                    onClick={ev => { ev.stopPropagation(); setShowCreateDrawer(true) }}
                    className="text-[10px] text-accent hover:text-cyan bg-transparent border border-accent/40 hover:border-cyan/60 rounded px-2 py-[2px] cursor-pointer">
                    + New task
                  </button>
                </div>
                <div>
                  {!epicTasks
                    ? <span className="text-muted italic text-xs">Loading…</span>
                    : epicTasks.length === 0
                    ? <span className="text-muted italic text-xs">No tasks</span>
                    : epicTasks.map(t => (
                        <EpicTaskChip key={t.id} task={t} epicId={e.id}
                          active={drillDown?.type === 'task' && drillDown.id === t.id}
                          onSelect={() => setDrillDown(
                            drillDown?.type === 'task' && drillDown.id === t.id
                              ? { type: 'epic', id: e.id }
                              : { type: 'task', id: t.id, epicId: e.id }
                          )}
                          onEdit={() => setEditTask(t)} />
                      ))
                  }
                </div>
              </div>
              {/* Decisions */}
              <div className="col-span-2 flex flex-col gap-1">
                <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Decisions</span>
                <div>
                  {!epicDecisions
                    ? <span className="text-muted italic text-xs">Loading…</span>
                    : epicDecisions.length === 0
                    ? <span className="text-muted italic text-xs">No decisions</span>
                    : epicDecisions.map(d => (
                        <span key={d.id}
                          onClick={ev => { ev.stopPropagation(); setDrillDown({ type: 'decision', id: d.id, epicId: e.id }) }}
                          className={`inline-block mr-1 mb-1 bg-surface border rounded px-2 py-[2px] text-[11px] cursor-pointer hover:bg-card
                            ${drillDown?.type === 'decision' && drillDown.id === d.id ? 'bg-[rgba(57,208,216,0.1)] border-cyan text-cyan' : 'border-border2 text-blue'}`}>
                          #{d.id} {d.title} <StatusBadge status={d.status} />
                          <CopyButton type="decision" id={d.id} title={d.title} />
                        </span>
                      ))
                  }
                </div>
              </div>
              {/* Drilled-down task detail */}
              {drillDown?.type === 'task' && drillDown.epicId === e.id && epicTasks && (() => {
                const t = epicTasks.find(t => t.id === drillDown.id)
                if (!t) return null
                return <EpicTaskDetail task={t} onEdit={() => setEditTask(t)} />
              })()}
              {/* Drilled-down decision detail */}
              {drillDown?.type === 'decision' && drillDown.epicId === e.id && epicDecisions && (() => {
                const d = epicDecisions.find(d => d.id === drillDown.id)
                if (!d) return null
                return (
                  <div className="col-span-2 border-t border-border pt-[10px] mt-1 flex flex-col gap-1">
                    <span className="text-[10px] text-purple uppercase tracking-[0.05em] font-semibold">Decision #{d.id} detail</span>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Content</span>
                      {d.content
                        ? <MarkdownContent>{d.content}</MarkdownContent>
                        : <span className="text-muted italic text-xs">No content</span>}
                    </div>
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Status</span>
                      <StatusBadge status={d.status} />
                    </div>
                  </div>
                )
              })()}
            </div>
          </td>
        </tr>
      )}

      {/* TaskDrawer for editing */}
      {editTask && <TaskDrawer task={editTask} onClose={() => setEditTask(null)} />}

      {/* TaskCreateDrawer */}
      {showCreateDrawer && (
        <TaskCreateDrawer epicId={e.id} project={e.project ?? currentProject}
          onClose={() => setShowCreateDrawer(false)} />
      )}
    </>
  )
}

function EpicTaskChip({ task: t, epicId, active, onSelect, onEdit }: {
  task: Task; epicId: number; active: boolean; onSelect: () => void; onEdit: () => void
}) {
  const hue = projectHue(t.project ?? '')
  void epicId, void hue
  return (
    <span className={`inline-flex items-center gap-1 mr-1 mb-1 bg-surface border rounded px-2 py-[2px] text-[11px] cursor-pointer hover:bg-card group/chip
      ${active ? 'bg-[rgba(57,208,216,0.1)] border-cyan text-cyan' : 'border-border2 text-blue'}`}>
      <span onClick={e => { e.stopPropagation(); onSelect() }}>
        #{t.id} {t.title} <StatusBadge status={t.status} />
      </span>
      <button onClick={e => { e.stopPropagation(); onEdit() }}
        title="Edit task"
        className="text-[10px] text-muted hover:text-foreground bg-transparent border-0 cursor-pointer opacity-0 group-hover/chip:opacity-100 transition-opacity px-[2px] leading-none">
        ✎
      </button>
      <CopyButton type="task" id={t.id} title={t.title} />
    </span>
  )
}

function EpicTaskDetail({ task: t, onEdit }: { task: Task; onEdit: () => void }) {
  const { setDrillDown } = useDrillDown()
  const { data: deps = [] } = useQuery({ queryKey: QK.taskDeps(t.id), queryFn: () => api.taskDeps(t.id) })

  return (
    <div className="col-span-2 border-t border-border pt-[10px] mt-1 grid grid-cols-2 gap-[10px_24px]">
      <div className="col-span-2 flex items-center justify-between">
        <span className="text-[10px] text-cyan uppercase tracking-[0.05em] font-semibold">Task #{t.id} detail</span>
        <button onClick={onEdit}
          className="text-[10px] text-accent hover:text-cyan bg-transparent border border-accent/40 hover:border-cyan/60 rounded px-2 py-[2px] cursor-pointer">
          ✎ Edit
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Description</span>
        {t.description
          ? <MarkdownContent>{t.description}</MarkdownContent>
          : <span className="text-muted italic text-xs">No description</span>}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Status / Owner</span>
        <span><StatusBadge status={t.status} /> <span className="text-muted text-xs">{t.owner || '—'}</span></span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Type</span>
        <TaskTypeBadge taskType={t.task_type} />
      </div>
      {t.task_type === 'testing'
        ? <div className="flex flex-col gap-1"><span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Testing</span><TestingBadge status={t.testing_status} /></div>
        : <div className="flex flex-col gap-1"><span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Verification</span><VerificationBadge status={t.verification_status} /></div>
      }
      {t.blocked_reason && (
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Block Reason</span>
          <span className="text-red">{t.blocked_reason}</span>
        </div>
      )}
      <div className="col-span-2 flex flex-col gap-1">
        <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Dependencies</span>
        <div>
          {deps.length === 0
            ? <span className="text-muted italic text-xs">None</span>
            : deps.map(d => (
                <span key={d.id}
                  className="inline-block mr-1 mb-1 bg-surface border border-border2 rounded px-2 py-[2px] text-[11px] text-blue cursor-pointer hover:bg-card"
                  onClick={() => setDrillDown({ type: 'task', id: d.id })}>
                  #{d.id} {d.title} <StatusBadge status={d.status} />
                </span>
              ))
          }
        </div>
      </div>
    </div>
  )
}
