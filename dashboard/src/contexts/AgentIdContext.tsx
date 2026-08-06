import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AgentIdContextValue {
  agentId: string | null
  setAgentId: (id: string) => void
  /** Returns agentId if set, or opens the prompt and resolves when user saves */
  requireAgentId: () => Promise<string | null>
  promptOpen: boolean
  resolvePrompt: (id: string) => void
  cancelPrompt: () => void
}

const AgentIdContext = createContext<AgentIdContextValue | null>(null)

export function AgentIdProvider({ children }: { children: ReactNode }) {
  const [agentId, setAgentIdState] = useState<string | null>(
    () => localStorage.getItem('ts_agent')
  )
  const [promptOpen, setPromptOpen] = useState(false)
  const [resolver, setResolver] = useState<((id: string | null) => void) | null>(null)

  const setAgentId = useCallback((id: string) => {
    localStorage.setItem('ts_agent', id)
    setAgentIdState(id)
  }, [])

  const requireAgentId = useCallback((): Promise<string | null> => {
    const stored = localStorage.getItem('ts_agent')
    if (stored) return Promise.resolve(stored)
    return new Promise((resolve) => {
      setResolver(() => resolve)
      setPromptOpen(true)
    })
  }, [])

  const resolvePrompt = useCallback((id: string) => {
    setAgentId(id)
    setPromptOpen(false)
    resolver?.(id)
    setResolver(null)
  }, [resolver, setAgentId])

  const cancelPrompt = useCallback(() => {
    setPromptOpen(false)
    resolver?.(null)
    setResolver(null)
  }, [resolver])

  return (
    <AgentIdContext.Provider value={{ agentId, setAgentId, requireAgentId, promptOpen, resolvePrompt, cancelPrompt }}>
      {children}
    </AgentIdContext.Provider>
  )
}

export function useAgentId() {
  const ctx = useContext(AgentIdContext)
  if (!ctx) throw new Error('useAgentId must be used within AgentIdProvider')
  return ctx
}
