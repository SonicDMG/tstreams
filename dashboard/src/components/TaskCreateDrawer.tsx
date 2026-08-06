import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { showError, showSuccess, errorMessage } from '../lib/toast'

const TASK_TYPES = ['implementation', 'testing', 'documentation', 'research', 'review'] as const

interface Props {
  epicId: number
  project: string
  onClose: () => void
}

export function TaskCreateDrawer({ epicId, project, onClose }: Props) {
  const qc = useQueryClient()
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [taskType, setTaskType] = useState<string>('implementation')
  const [selectedDeps, setSelectedDeps] = useState<number[]>([])

  // Load existing tasks in this epic for dep selection
  const { data: epicTasks = [] } = useQuery({
    queryKey: QK.epicTasks(epicId),
    queryFn: () => api.epicTasks(epicId),
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const task = await api.createTask({
        title: title.trim(),
        description: desc || undefined,
        epic_id: epicId,
        project,
        deps: selectedDeps.length ? selectedDeps : undefined,
      })
      if (taskType !== 'implementation') {
        await api.setTaskType(task.id, taskType)
      }
      return task
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: QK.tasks() })
      qc.invalidateQueries({ queryKey: QK.epicTasks(epicId) })
      qc.invalidateQueries({ queryKey: QK.epics() })
      qc.invalidateQueries({ queryKey: QK.stats() })
      showSuccess(`Task #${task.id} created`)
      onClose()
    },
    onError: (err) => showError(errorMessage(err)),
  })

  function toggleDep(id: number) {
    setSelectedDeps(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onKeyDown={handleKeyDown}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative z-10 w-[480px] max-w-full h-full bg-card border-l border-border flex flex-col shadow-2xl"
           style={{ animation: 'slideInRight 0.18s ease' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-[14px] border-b border-border flex-shrink-0">
          <span className="text-sm font-semibold text-foreground">
            New Task <span className="text-muted text-xs font-normal">in Epic #{epicId}</span>
          </span>
          <button onClick={onClose}
            className="text-muted hover:text-foreground text-lg leading-none bg-transparent border-0 cursor-pointer px-1">
            ✕
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Title *</label>
            <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Add error handling to login flow"
              className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent w-full" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={5}
              placeholder="Optional — describe acceptance criteria, context, etc."
              className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent w-full resize-y" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)}
              className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-accent w-full">
              {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {epicTasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">
                Dependencies <span className="normal-case font-normal">(click to select)</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {epicTasks.map(t => (
                  <button key={t.id} onClick={() => toggleDep(t.id)}
                    className={`px-2 py-[3px] text-[11px] rounded border cursor-pointer bg-transparent transition-colors
                      ${selectedDeps.includes(t.id)
                        ? 'border-cyan text-cyan bg-[rgba(57,208,216,0.1)]'
                        : 'border-border2 text-muted hover:text-foreground hover:border-border'}`}>
                    #{t.id} {t.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-[14px] border-t border-border flex-shrink-0">
          <button onClick={onClose}
            className="px-3 py-[6px] text-xs text-muted hover:text-foreground bg-transparent border border-border2 rounded-md cursor-pointer">
            Cancel
          </button>
          <button onClick={() => createMut.mutate()} disabled={!title.trim() || createMut.isPending}
            className="px-3 py-[6px] text-xs text-white bg-accent border-0 rounded-md cursor-pointer hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed">
            {createMut.isPending ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    </div>
  )
}
