export interface Epic {
  id: number
  title: string
  status: 'open' | 'closed'
  project: string
  task_count: number
  done_count: number
  decisions_open_count?: number
}

export interface Task {
  id: number
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'blocked' | 'done'
  owner?: string
  epic_id?: number
  project: string
  blocked_reason?: string
  task_type?: string
  github_issue_number?: number
  github_repo?: string
  verification_status?: string
  verified_at?: number
  verified_by?: string
  verification_method?: string
  testing_status?: string
  tested_by?: string
  test_method?: string
  test_result?: string
  code_paths?: CodePath[]
  deps?: number[]
}

export interface CodePath {
  file_path: string
  function_name?: string
  commit_hash: string
  commit_date?: string
  notes?: string
}

export interface Agent {
  id: string
  last_heartbeat: number
  current_task?: number
}

export interface Stats {
  tasks_done: number
  tasks_open: number
  tasks_total: number
  decisions_open: number
  closed_epic_count: number
}

export interface Decision {
  id: number
  title: string
  content?: string
  status: 'open' | 'decided' | 'rejected'
  epic_id?: number
  created_at: number
}

export interface Version {
  id: number
  name: string
  project: string
  description?: string
  task_count: number
  created_at: number
}

export interface VersionDiff {
  from_version?: Version
  to_version: Version
  tasks: Task[]
}

export interface TaskDep {
  id: number
  title: string
  status: string
}

export interface SSEEvent {
  id: number
  project: string
  task_id?: number
  agent_id?: string
  type: string
  payload: string
  ts: number
}
