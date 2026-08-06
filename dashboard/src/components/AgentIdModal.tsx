import { useState } from 'react'
import { useAgentId } from '../contexts/AgentIdContext'

export function AgentIdModal() {
  const { promptOpen, resolvePrompt, cancelPrompt } = useAgentId()
  const [value, setValue] = useState('')

  if (!promptOpen) return null

  function handleSave() {
    const trimmed = value.trim()
    if (!trimmed) return
    resolvePrompt(trimmed)
    setValue('')
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') { cancelPrompt(); setValue('') }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-card border border-border rounded-lg p-6 w-[360px] flex flex-col gap-4 shadow-xl">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Enter your agent ID</h2>
          <p className="text-xs text-muted mt-1">
            Required for task mutations. Matches your <code className="text-cyan">TSTREAMS_AGENT</code> env var or CLI <code className="text-cyan">--agent</code> value.
          </p>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="e.g. bob"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
          className="bg-surface border border-border2 rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent w-full"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={() => { cancelPrompt(); setValue('') }}
            className="px-3 py-[6px] text-xs text-muted hover:text-foreground bg-transparent border border-border2 rounded-md cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="px-3 py-[6px] text-xs text-white bg-accent border-0 rounded-md cursor-pointer hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save and continue
          </button>
        </div>
      </div>
    </div>
  )
}
