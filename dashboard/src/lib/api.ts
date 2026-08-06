import type {
  Agent, Decision, Epic, Stats, Task, TaskDep,
  Version, VersionDiff,
} from './types'

const BASE = ''  // same origin

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, init)
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(body || `HTTP ${r.status}`)
  }
  return r.json() as Promise<T>
}

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, v)
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export const api = {
  epics: (project?: string, status?: string) =>
    req<Epic[]>(`/epics${qs({ project, status })}`),

  tasks: (project?: string, status?: string) =>
    req<Task[]>(`/tasks${qs({ project, status })}`),

  epicTasks: (epicId: number) =>
    req<Task[]>(`/tasks?epic_id=${epicId}`),

  epicDecisions: (epicId: number) =>
    req<Decision[]>(`/decisions?epic_id=${epicId}`),

  taskDeps: (taskId: number) =>
    req<TaskDep[]>(`/tasks/${taskId}/deps`),

  agents: () =>
    req<Agent[]>('/agents'),

  stats: (project?: string) =>
    req<Stats>(`/stats${qs({ project })}`),

  versions: (project?: string) =>
    req<Version[]>(`/versions${qs({ project })}`),

  projects: () =>
    req<string[]>('/projects'),

  versionDiff: (project: string, to: string, from?: string) =>
    req<VersionDiff>(`/versions/diff${qs({ project, to, from })}`),

  // ── Mutations ──────────────────────────────────────────────────────────────

  claimTask: (taskId: number, agentId: string) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId }),
    }),

  completeTask: (taskId: number, agentId: string) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId }),
    }),

  blockTask: (taskId: number, agentId: string, reason: string) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, reason }),
    }),

  unblockTask: (taskId: number) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/unblock`, { method: 'POST' }),

  updateTask: (taskId: number, patch: { title?: string; description?: string; task_type?: string }) =>
    req<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  createTask: (body: {
    title: string
    description?: string
    epic_id?: number
    project?: string
    deps?: number[]
  }) =>
    req<Task>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),

  setTaskType: (taskId: number, taskType: string) =>
    req<{ ok: boolean }>(`/tasks/${taskId}/type?task_type=${encodeURIComponent(taskType)}`, {
      method: 'POST',
    }),

  closeEpic: (epicId: number) =>
    req<Epic>(`/epics/${epicId}/close`, { method: 'POST' }),

  resolveDecision: (decisionId: number) =>
    req<Decision>(`/decisions/${decisionId}/resolve`, { method: 'POST' }),

  updateDecision: (decisionId: number, patch: { title?: string; content?: string }) =>
    req<Decision>(`/decisions/${decisionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
}
