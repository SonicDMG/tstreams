import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export type DrillDownType = 'epic' | 'task' | 'decision'

export interface DrillDown {
  type: DrillDownType
  id: number
  epicId?: number
}

interface DrillDownContextValue {
  drillDown: DrillDown | null
  setDrillDown: (d: DrillDown | null) => void
  currentProject: string
  setCurrentProject: (p: string) => void
}

const DrillDownContext = createContext<DrillDownContextValue | null>(null)

function readURL(): { drillDown: DrillDown | null; project: string } {
  const p = new URLSearchParams(location.search)
  const project = p.get('project') ?? localStorage.getItem('ts_project') ?? ''
  let drillDown: DrillDown | null = null
  if (p.has('task')) {
    drillDown = { type: 'task', id: parseInt(p.get('task')!), epicId: p.has('epic') ? parseInt(p.get('epic')!) : undefined }
  } else if (p.has('epic')) {
    drillDown = { type: 'epic', id: parseInt(p.get('epic')!) }
  } else if (p.has('decision')) {
    drillDown = { type: 'decision', id: parseInt(p.get('decision')!), epicId: p.has('epic') ? parseInt(p.get('epic')!) : undefined }
  }
  return { drillDown, project }
}

function pushURL(project: string, drillDown: DrillDown | null) {
  const params = new URLSearchParams()
  if (project) params.set('project', project)
  if (drillDown) {
    if (drillDown.type === 'epic') params.set('epic', String(drillDown.id))
    if (drillDown.type === 'task') {
      params.set('task', String(drillDown.id))
      if (drillDown.epicId) params.set('epic', String(drillDown.epicId))
    }
    if (drillDown.type === 'decision') {
      params.set('decision', String(drillDown.id))
      if (drillDown.epicId) params.set('epic', String(drillDown.epicId))
    }
  }
  const qs = params.toString()
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname)
}

export function DrillDownProvider({ children }: { children: ReactNode }) {
  const initial = readURL()
  const [drillDown, setDrillDownState] = useState<DrillDown | null>(initial.drillDown)
  const [currentProject, setCurrentProjectState] = useState(initial.project)

  const setDrillDown = useCallback((d: DrillDown | null) => {
    setDrillDownState(d)
    pushURL(currentProject, d)
  }, [currentProject])

  const setCurrentProject = useCallback((p: string) => {
    setCurrentProjectState(p)
    if (p) localStorage.setItem('ts_project', p)
    else localStorage.removeItem('ts_project')
    pushURL(p, null)
  }, [])

  // Keep URL in sync when project changes
  useEffect(() => {
    pushURL(currentProject, drillDown)
  }, [currentProject, drillDown])

  return (
    <DrillDownContext.Provider value={{ drillDown, setDrillDown, currentProject, setCurrentProject }}>
      {children}
    </DrillDownContext.Provider>
  )
}

export function useDrillDown() {
  const ctx = useContext(DrillDownContext)
  if (!ctx) throw new Error('useDrillDown must be used within DrillDownProvider')
  return ctx
}
