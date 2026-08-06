import { useQuery } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { useDrillDown } from '../contexts/DrillDownContext'
import type { Task } from '../lib/types'
import {
  StatusBadge, TaskTypeBadge, VerificationBadge, TestingBadge,
  ProjectPill, GhBadge,
} from './Badges'
import { CopyButton } from './CopyButton'
import { Panel, EmptyRow, Td, SectionLabel } from './PanelPrimitives'

type PanelType = 'active' | 'blocked' | 'pending'

interface TaskPanelProps {
  type: PanelType
  project?: string
  // Injected agent list to detect "live" tasks
  agentCurrentTasks: number[]
}

const PANEL_STATUS: Record<PanelType, string> = {
  active:  'in_progress',
  blocked: 'blocked',
  pending: 'pending',
}

const PANEL_TITLES: Record<PanelType, string> = {
  active:  'Active',
  blocked: 'Blocked',
  pending: 'Pending',
}

export function TaskPanel({ type, project, agentCurrentTasks }: TaskPanelProps) {
  const { drillDown, setDrillDown } = useDrillDown()
  const status = PANEL_STATUS[type]
  const { data: tasks = [] } = useQuery({
    queryKey: QK.tasks(project, status),
    queryFn: () => api.tasks(project, status),
  })

  const colSpan = type === 'blocked' ? 4 : type === 'active' ? 6 : 5

  return (
    <Panel title={PANEL_TITLES[type]} count={tasks.length}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface">ID</th>
            <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface col-project">Project</th>
            <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface">Title</th>
            {type !== 'blocked' && <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface col-github">GitHub</th>}
            {type === 'active'  && <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface col-owner">Owner</th>}
            {type === 'pending' && <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface col-epic">Epic</th>}
            {type === 'blocked' && <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface col-reason">Reason</th>}
            {type !== 'blocked' && <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface">Type</th>}
            {type !== 'blocked' && <th className="text-left text-[10px] font-bold text-muted uppercase tracking-[0.06em] px-4 py-[7px] border-b border-border bg-surface col-status-active">Verify/Test</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0
            ? <EmptyRow cols={colSpan} msg={`No ${type} tasks`} />
            : tasks.map(t => {
                const isExpanded = drillDown?.type === 'task' && drillDown.id === t.id
                const isLive = agentCurrentTasks.includes(t.id)
                const borderColor = type === 'active' ? 'var(--cyan)' : type === 'blocked' ? 'var(--red)' : 'var(--muted)'
                return (
                  <>
                    <tr
                      key={t.id}
                      id={`task-row-${t.id}`}
                      data-task-id={t.id}
                      className={`cursor-pointer hover:[&>td]:bg-white/[0.025] ${isExpanded ? '[&>td]:bg-[rgba(31,111,235,0.07)]' : ''}`}
                      style={isExpanded ? {} : {}}
                      onClick={() => setDrillDown(
                        isExpanded
                          ? (t.epic_id ? { type: 'epic', id: t.epic_id } : null)
                          : { type: 'task', id: t.id, epicId: t.epic_id }
                      )}
                    >
                      <td className="px-4 py-[9px] border-b border-border align-middle font-mono text-xs text-muted"
                        style={{ borderLeft: `3px solid ${borderColor}` }}>
                        <CopyButton type="task" id={t.id} title={t.title} />#{t.id}
                      </td>
                      <Td className="col-project"><ProjectPill name={t.project} /></Td>
                      <Td bold className="max-w-[260px] whitespace-nowrap overflow-hidden text-ellipsis">
                        {isLive && <span className="agent-working inline-block mr-[6px] text-green text-sm leading-none" />}
                        {t.title}
                      </Td>
                      {type !== 'blocked' && <Td className="col-github"><GhBadge issueNumber={t.github_issue_number} repo={t.github_repo} /></Td>}
                      {type === 'active'  && <Td className="col-owner text-cyan text-xs">{t.owner || '—'}</Td>}
                      {type === 'pending' && <Td className="col-epic text-muted text-xs">{t.epic_id ? `#${t.epic_id}` : '—'}</Td>}
                      {type === 'blocked' && <Td className="col-reason text-red text-xs">{t.blocked_reason || '—'}</Td>}
                      {type !== 'blocked' && <Td><TaskTypeBadge taskType={t.task_type} /></Td>}
                      {type !== 'blocked' && (
                        <Td className="col-status-active">
                          {t.task_type === 'testing' && t.testing_status
                            ? <TestingBadge status={t.testing_status} />
                            : <VerificationBadge status={t.verification_status} />
                          }
                        </Td>
                      )}
                    </tr>
                    {isExpanded && <TaskDetailRow key={`${t.id}-detail`} task={t} colSpan={colSpan} />}
                  </>
                )
              })
          }
        </tbody>
      </table>
    </Panel>
  )
}

function TaskDetailRow({ task: t, colSpan }: { task: Task; colSpan: number }) {
  const { setDrillDown } = useDrillDown()
  const { data: deps = [] } = useQuery({ queryKey: QK.taskDeps(t.id), queryFn: () => api.taskDeps(t.id) })

  return (
    <tr className="[&>td]:p-0 [&>td]:border-b [&>td]:border-border">
      <td colSpan={colSpan}>
        <div className="p-[14px_20px] bg-background border-t border-border text-[13px] grid grid-cols-2 gap-[10px_24px]">
          <Field label="Description">
            {t.description || <span className="text-muted italic">No description</span>}
          </Field>
          <Field label="Epic">{t.epic_id ? `#${t.epic_id}` : '—'}</Field>
          <Field label="Owner">{t.owner || '—'}</Field>
          <Field label="Status"><StatusBadge status={t.status} /></Field>
          <Field label="Type"><TaskTypeBadge taskType={t.task_type} /></Field>
          {t.task_type === 'testing'
            ? <Field label="Testing Status"><TestingBadge status={t.testing_status} /></Field>
            : <Field label="Verification"><VerificationBadge status={t.verification_status} /></Field>
          }
          {t.verified_by && <Field label="Verified by"><span className="text-cyan">{t.verified_by}</span></Field>}
          {t.tested_by   && <Field label="Tested by"><span className="text-cyan">{t.tested_by}</span></Field>}
          {t.verification_method && <Field label="Verification Method"><span className="text-blue text-xs">{t.verification_method}</span></Field>}
          {t.test_method && <Field label="Test Method"><span className="text-blue text-xs">{t.test_method}</span></Field>}
          {t.blocked_reason && (
            <div className="col-span-2">
              <Field label="Block Reason"><span className="text-red">{t.blocked_reason}</span></Field>
            </div>
          )}
          {t.code_paths && t.code_paths.length > 0 && (
            <div className="col-span-2">
              <Field label="Code Locations">
                <div className="flex flex-col gap-2">
                  {t.code_paths.map((cp, i) => (
                    <div key={i} className="bg-border p-2 rounded font-mono text-[11px]">
                      <div className="text-cyan">{cp.file_path}{cp.function_name ? `::${cp.function_name}` : ''}</div>
                      <div className="text-muted mt-[2px]">commit: <span className="text-yellow">{cp.commit_hash.substring(0, 8)}</span></div>
                      {cp.notes && <div className="text-muted mt-[2px]">{cp.notes}</div>}
                    </div>
                  ))}
                </div>
              </Field>
            </div>
          )}
          <div className="col-span-2">
            <Field label="Dependencies">
              {deps.length === 0
                ? <span className="text-muted italic">None</span>
                : deps.map(d => (
                    <span key={d.id}
                      className="inline-block mr-1 mb-1 bg-surface border border-border2 rounded px-2 py-[2px] text-[11px] text-blue cursor-pointer hover:bg-card"
                      onClick={() => setDrillDown({ type: 'task', id: d.id })}>
                      #{d.id} {d.title} <StatusBadge status={d.status} />
                    </span>
                  ))
              }
            </Field>
          </div>
        </div>
      </td>
    </tr>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">{label}</span>
      <span className="text-foreground whitespace-pre-wrap break-words">{children}</span>
    </div>
  )
}

// ── Task panels section ───────────────────────────────────────────────────────

export function TaskPanelsSection() {
  const { currentProject } = useDrillDown()
  const { data: agents = [] } = useQuery({ queryKey: QK.agents(), queryFn: api.agents })
  const agentCurrentTasks = agents.map(a => a.current_task).filter((x): x is number => x != null)

  return (
    <div>
      <SectionLabel>Tasks</SectionLabel>
      <div className="grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
        <TaskPanel type="active"  project={currentProject} agentCurrentTasks={agentCurrentTasks} />
        <TaskPanel type="blocked" project={currentProject} agentCurrentTasks={agentCurrentTasks} />
        <TaskPanel type="pending" project={currentProject} agentCurrentTasks={agentCurrentTasks} />
        <AgentPanelImport />
      </div>
    </div>
  )
}

// Local re-export to avoid circular import
import { AgentPanel } from './PanelPrimitives'
function AgentPanelImport() { return <AgentPanel /> }
