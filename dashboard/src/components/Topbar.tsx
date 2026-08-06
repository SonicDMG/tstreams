import { useSSE } from '../contexts/SSEContext'
import { useDrillDown } from '../contexts/DrillDownContext'
import { useQuery } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'

interface TopbarProps {
  onRefresh: () => void
}

export function Topbar({ onRefresh }: TopbarProps) {
  const { status } = useSSE()
  const { currentProject, setCurrentProject, drillDown, setDrillDown } = useDrillDown()
  const { data: projects = [] } = useQuery({ queryKey: QK.projects(), queryFn: api.projects })
  const { data: epics = [] } = useQuery({ queryKey: QK.epics(currentProject, 'open'), queryFn: () => api.epics(currentProject, 'open') })

  const connClass = status === 'live' ? 'bg-[rgba(63,185,80,0.15)] text-green'
    : status === 'error' ? 'bg-[rgba(248,81,73,0.15)] text-red'
    : 'bg-border text-muted'
  const connLabel = status === 'live' ? '● live' : status === 'error' ? '✘ disconnected' : 'connecting…'

  // Build breadcrumb crumbs
  const crumbs: { label: string; onClick?: () => void }[] = []
  if (drillDown) {
    crumbs.push({ label: 'All Epics', onClick: () => setDrillDown(null) })
    if (drillDown.type === 'epic' || drillDown.type === 'task' || drillDown.type === 'decision') {
      const epicId = drillDown.type === 'epic' ? drillDown.id : drillDown.epicId
      const epic = epicId ? epics.find(e => e.id === epicId) : undefined
      if (epicId) {
        const label = epic ? `Epic #${epic.id}: ${epic.title}` : `Epic #${epicId}`
        if (drillDown.type === 'epic') {
          crumbs.push({ label })
        } else {
          crumbs.push({ label, onClick: () => setDrillDown({ type: 'epic', id: epicId }) })
          crumbs.push({ label: drillDown.type === 'task' ? `Task #${drillDown.id}` : `Decision #${drillDown.id}` })
        }
      }
    }
  }

  return (
    <div className="bg-surface border-b border-border px-6 py-[10px] flex items-center gap-[14px] sticky top-0 z-20 flex-wrap">
      {/* Logo */}
      <div className="text-[15px] font-bold tracking-wide whitespace-nowrap">
        t<span className="text-cyan">streams</span>
      </div>

      {/* Connection status */}
      <span className={`text-[11px] px-2 py-[2px] rounded-full whitespace-nowrap ${connClass}`}>
        {connLabel}
      </span>

      {/* Breadcrumb */}
      {crumbs.length > 0 && (
        <nav className="flex items-center gap-[6px] text-xs text-muted min-w-0 overflow-hidden">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-[6px] min-w-0">
              {i > 0 && <span className="text-border2 flex-shrink-0">/</span>}
              {c.onClick
                ? <span className="text-blue cursor-pointer hover:underline whitespace-nowrap" onClick={c.onClick}>{c.label}</span>
                : <span className="overflow-hidden text-ellipsis whitespace-nowrap">{c.label}</span>
              }
            </span>
          ))}
        </nav>
      )}

      {/* Right side */}
      <div className="ml-auto flex items-center gap-[10px]">
        <label className="text-[11px] text-muted hidden sm:block" htmlFor="project-select">Project:</label>
        <select
          id="project-select"
          value={currentProject}
          onChange={e => setCurrentProject(e.target.value)}
          className="bg-card text-foreground border border-border2 rounded-md px-[10px] py-[3px] text-xs cursor-pointer min-w-[130px]"
        >
          <option value="">All projects</option>
          {projects.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          onClick={onRefresh}
          className="bg-accent text-white border-0 px-3 py-1 rounded-md text-xs font-medium cursor-pointer hover:opacity-85"
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  )
}
