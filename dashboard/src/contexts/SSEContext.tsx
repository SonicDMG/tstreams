import {
  createContext, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SSE_INVALIDATIONS } from '../lib/queryKeys'
import type { SSEEvent } from '../lib/types'

type SSEStatus = 'connecting' | 'live' | 'error'

interface SSEContextValue {
  status: SSEStatus
  events: SSEEvent[]
}

const SSEContext = createContext<SSEContextValue>({ status: 'connecting', events: [] })

interface SSEProviderProps {
  children: ReactNode
  project?: string
}

export function SSEProvider({ children, project }: SSEProviderProps) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SSEStatus>('connecting')
  const [events, setEvents] = useState<SSEEvent[]>([])
  const lastIdRef = useRef(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      const params = new URLSearchParams({ lastEventId: String(lastIdRef.current) })
      if (project) params.set('project', project)
      const es = new EventSource(`/events?${params}`)
      esRef.current = es

      es.onopen = () => setStatus('live')

      es.onmessage = (e) => {
        const ev: SSEEvent = JSON.parse(e.data)
        lastIdRef.current = ev.id

        // Prepend to feed (newest first), cap at 100
        setEvents(prev => [ev, ...prev].slice(0, 100))

        // Invalidate relevant query keys
        const keys = SSE_INVALIDATIONS[ev.type]
        if (keys) {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
        }
      }

      es.onerror = () => {
        setStatus('error')
        es.close()
        retryTimer = setTimeout(connect, 3000)
      }
    }

    connect()
    return () => {
      clearTimeout(retryTimer)
      esRef.current?.close()
    }
  }, [queryClient, project])

  return (
    <SSEContext.Provider value={{ status, events }}>
      {children}
    </SSEContext.Provider>
  )
}

export function useSSE() {
  return useContext(SSEContext)
}
