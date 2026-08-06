import { useQuery } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { useSSE } from '../contexts/SSEContext'
import { useDrillDown } from '../contexts/DrillDownContext'

interface HeroProps {
  kpiFilter: string | null
  onKpiClick: (filter: string) => void
}

export function KpiRowAndHero({ kpiFilter, onKpiClick }: HeroProps) {
  const { currentProject } = useDrillDown()
  const { status } = useSSE()
  const { data: stats } = useQuery({ queryKey: QK.stats(currentProject), queryFn: () => api.stats(currentProject) })
  const { data: versions = [] } = useQuery({ queryKey: QK.versions(currentProject), queryFn: () => api.versions(currentProject) })

  const projectName = currentProject || 'tstreams'

  const kpis = [
    { id: 'tasks_done',     value: stats?.tasks_done,     label: 'Tasks closed',    color: 'text-green' },
    { id: 'tasks_open',     value: stats?.tasks_open,     label: 'Tasks open',      color: 'text-yellow' },
    { id: 'tasks_total',    value: stats?.tasks_total,    label: 'Tasks total',     color: 'text-cyan' },
    { id: 'decisions_open', value: stats?.decisions_open, label: 'Decisions open',  color: 'text-purple' },
    { id: 'versions',       value: versions.length || undefined, label: 'Versions tagged', color: 'text-blue', noFilter: true },
  ]

  return (
    <>
      {/* Hero */}
      <div className="border-b border-border px-7 py-5 pb-4 bg-surface">
        <div className="flex items-center gap-[10px] text-[22px] font-bold tracking-tight mb-1">
          <span
            className="w-[10px] h-[10px] rounded-full flex-shrink-0 transition-colors"
            style={{
              background: status === 'live' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--muted)',
              boxShadow: status === 'live' ? '0 0 6px var(--green)' : undefined,
            }}
          />
          {projectName}
        </div>
        <div className="text-xs text-muted">Live project status · auto-refreshes on events</div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-px bg-border border-b border-border max-sm:grid-cols-2">
        {kpis.map(k => {
          const active = kpiFilter === k.id
          return (
            <div
              key={k.id}
              onClick={() => !k.noFilter && onKpiClick(k.id)}
              className={`bg-card px-5 py-[18px] flex flex-col gap-[2px] border border-transparent transition-colors
                ${!k.noFilter ? 'cursor-pointer hover:bg-white/[0.04]' : ''}
                ${active ? 'border-current bg-white/[0.04]' : ''}`}
            >
              <div className={`text-[32px] font-bold leading-none tabular-nums ${k.color}`}>
                {k.value ?? '—'}
              </div>
              <div className={`text-[10px] font-semibold uppercase tracking-widest text-muted mt-1${active ? " after:content-['_↓'] after:opacity-60" : ''}`}>
                {k.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Meta bar */}
      <div className="text-[11px] text-muted px-7 py-[6px] border-b-[3px] border-accent bg-surface flex gap-4">
        <span>Last updated: {new Date().toLocaleTimeString()}</span>
        <span>·</span>
        <span>click an epic to expand</span>
      </div>
    </>
  )
}
