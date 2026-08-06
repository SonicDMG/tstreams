import { Toaster } from 'sonner'
import { AgentIdProvider } from './contexts/AgentIdContext'
import { SSEProvider } from './contexts/SSEContext'
import { DrillDownProvider } from './contexts/DrillDownContext'
import { Dashboard } from './components/Dashboard'
import { AgentIdModal } from './components/AgentIdModal'

export default function App() {
  return (
    <AgentIdProvider>
      <DrillDownProvider>
        <SSEProvider>
          <Dashboard />
          <AgentIdModal />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              },
            }}
          />
        </SSEProvider>
      </DrillDownProvider>
    </AgentIdProvider>
  )
}
