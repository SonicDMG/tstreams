import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { QK } from '../lib/queryKeys'
import { api } from '../lib/api'
import { showError, showSuccess, errorMessage } from '../lib/toast'
import { MarkdownContent } from './MarkdownContent'
import type { Task } from '../lib/types'

const TASK_TYPES = ['implementation', 'testing', 'documentation', 'research', 'review'] as const

interface Props {
  task: Task | null
  onClose: () => void
}

export function TaskDrawer({ task, onClose }: Props) {
  const qc = useQueryClient()
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [taskType, setTaskType] = useState('')
  const [descTab, setDescTab]   = useState<'edit' | 'preview'>('edit')

  // Sync fields when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title ?? '')
      setDesc(task.description ?? '')
      setTaskType(task.task_type ?? 'implementation')
    }
  }, [task])

  const updateMut = useMutation({
    mutationFn: () =>
      api.updateTask(task!.id, {
        title:       title.trim() !== task!.title ? title.trim() : undefined,
        description: desc !== task!.description   ? desc          : undefined,
        task_type:   taskType !== task!.task_type  ? taskType     : undefined,
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: QK.tasks() })
      if (task!.epic_id) qc.invalidateQueries({ queryKey: QK.epicTasks(task!.epic_id) })
      showSuccess(`Task #${updated.id} updated`)
      onClose()
    },
    onError: (err) => showError(errorMessage(err)),
  })

  const unblockMut = useMutation({
    mutationFn: () => api.unblockTask(task!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tasks() })
      if (task!.epic_id) qc.invalidateQueries({ queryKey: QK.epicTasks(task!.epic_id) })
      qc.invalidateQueries({ queryKey: QK.stats() })
      showSuccess(`Task #${task!.id} unblocked`)
      onClose()
    },
    onError: (err) => showError(errorMessage(err)),
  })

  if (!task) return null

  const isDirty = title.trim() !== (task.title ?? '') ||
                  desc !== (task.description ?? '')    ||
                  taskType !== (task.task_type ?? 'implementation')

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
          <span className="text-sm font-semibold text-foreground">Edit Task <span className="text-muted font-mono">#{task.id}</span></span>
          <button onClick={onClose}
            className="text-muted hover:text-foreground text-lg leading-none bg-transparent border-0 cursor-pointer px-1">
            ✕
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-accent w-full" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Description</label>
              <div className="flex text-[11px] border border-border2 rounded overflow-hidden">
                <button
                  onClick={() => setDescTab('edit')}
                  className={`px-2 py-[2px] border-0 cursor-pointer ${descTab === 'edit' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-foreground'}`}>
                  Edit
                </button>
                <button
                  onClick={() => setDescTab('preview')}
                  className={`px-2 py-[2px] border-0 cursor-pointer ${descTab === 'preview' ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-foreground'}`}>
                  Preview
                </button>
              </div>
            </div>
            {descTab === 'edit'
              ? <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={6}
                  className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-accent w-full resize-y" />
              : <div className="bg-surface border border-border2 rounded-md px-3 py-2 min-h-[120px] text-sm">
                  {desc.trim()
                    ? <MarkdownContent>{desc}</MarkdownContent>
                    : <span className="text-muted italic">Nothing to preview</span>}
                </div>
            }
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Task Type</label>
            <select value={taskType} onChange={e => setTaskType(e.target.value)}
              className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-accent w-full">
              {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {task.blocked_reason && (
            <div className="flex flex-col gap-2 bg-surface border border-red/30 rounded-md p-3">
              <span className="text-[10px] text-muted uppercase tracking-[0.05em] font-semibold">Block Reason</span>
              <span className="text-red text-xs">{task.blocked_reason}</span>
              <button onClick={() => unblockMut.mutate()}
                disabled={unblockMut.isPending}
                className="self-start px-3 py-[6px] text-xs text-white bg-red/70 border-0 rounded-md cursor-pointer hover:bg-red/90 disabled:opacity-40 disabled:cursor-not-allowed">
                {unblockMut.isPending ? 'Unblocking…' : 'Unblock'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-[14px] border-t border-border flex-shrink-0">
          <button onClick={onClose}
            className="px-3 py-[6px] text-xs text-muted hover:text-foreground bg-transparent border border-border2 rounded-md cursor-pointer">
            Cancel
          </button>
          <button onClick={() => updateMut.mutate()} disabled={!isDirty || !title.trim() || updateMut.isPending}
            className="px-3 py-[6px] text-xs text-white bg-accent border-0 rounded-md cursor-pointer hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed">
            {updateMut.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
