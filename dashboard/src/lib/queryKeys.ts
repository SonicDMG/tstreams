// Central registry of all TanStack Query keys.
// Structure: arrays for precise invalidation at any level.

export const QK = {
  epics:     (project?: string, status?: string) => ['epics',     { project, status }] as const,
  tasks:     (project?: string, status?: string) => ['tasks',     { project, status }] as const,
  agents:    ()                                  => ['agents']                         as const,
  stats:     (project?: string)                  => ['stats',     { project }]         as const,
  versions:  (project?: string)                  => ['versions',  { project }]         as const,
  projects:  ()                                  => ['projects']                       as const,
  epicTasks: (epicId: number)                    => ['epic', epicId, 'tasks']          as const,
  epicDecs:  (epicId: number)                    => ['epic', epicId, 'decisions']      as const,
  taskDeps:  (taskId: number)                    => ['task', taskId, 'deps']           as const,
}

// Which query keys to invalidate per SSE event type
export const SSE_INVALIDATIONS: Record<string, Array<readonly unknown[]>> = {
  task_claimed:               [['tasks'], ['epics'], ['stats'], ['agents']],
  task_completed:             [['tasks'], ['epics'], ['stats'], ['agents']],
  task_blocked:               [['tasks'], ['epics'], ['stats'], ['agents']],
  task_unblocked:             [['tasks'], ['epics'], ['stats']],
  task_created:               [['tasks'], ['epics'], ['stats']],
  task_updated:               [['tasks'], ['epics']],
  epic_closed:                [['epics'], ['stats']],
  decision_resolved:          [['epic'], ['stats']],
  epic_created:               [['epics'], ['stats']],
  agent_registered:           [['agents']],
  version_created:            [['versions']],
  code_verification_updated:  [['tasks']],
  testing_status_updated:     [['tasks']],
  task_github_linked:         [['tasks']],
  // heartbeat intentionally omitted — no visible state change
}
