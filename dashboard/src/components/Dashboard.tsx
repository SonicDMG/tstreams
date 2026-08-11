import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Topbar } from './Topbar'
import { KpiRowAndHero } from './KpiRowAndHero'
import { EpicTable } from './EpicTable'
import { TaskPanelsSection } from './TaskPanel'
import { EventFeed, VersionPanel, DecisionPanel } from './PanelPrimitives'
import { useDrillDown } from '../contexts/DrillDownContext'
import { useQuery } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { SSEProvider } from '../contexts/SSEContext'

export function Dashboard() {
  const queryClient = useQueryClient()
  const { currentProject } = useDrillDown()
  const [kpiFilter, setKpiFilter] = useState<string | null>(null)

  function handleKpiClick(filter: string) {
    setKpiFilter(f => f === filter ? null : filter)
  }

  // Collect loaded epic IDs for the DecisionPanel
  const { data: openEpics = [] } = useQuery({
    queryKey: QK.epics(currentProject, 'open'),
    queryFn: () => api.epics(currentProject, 'open'),
  })
  const { data: stats } = useQuery({
    queryKey: QK.stats(currentProject),
    queryFn: () => api.stats(currentProject),
  })

  function handleRefresh() {
    queryClient.invalidateQueries()
  }

  return (
    // Re-mount SSEProvider when project changes so it reconnects with new project filter
    <SSEProvider project={currentProject || undefined}>
      <div className="min-h-screen bg-background text-foreground">
        <Topbar onRefresh={handleRefresh} />
        <KpiRowAndHero kpiFilter={kpiFilter} onKpiClick={handleKpiClick} />

        <main className="max-w-[1100px] mx-auto px-4 py-6 flex flex-col gap-7">
          <EpicTable epicFilter={kpiFilter} onEpicFilterChange={setKpiFilter} />
          <TaskPanelsSection />
          {(stats?.decisions_open ?? 0) > 0 && (
            <DecisionPanel
              loadedEpicIds={openEpics.map(e => e.id)}
              decisionsOpenCount={stats?.decisions_open ?? 0}
            />
          )}
          <VersionPanel />
          <EventFeed />
        </main>
      </div>
    </SSEProvider>
  )
}
