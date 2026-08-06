import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // All asset URLs will be prefixed with /dashboard/ so FastAPI can serve them
  base: '/dashboard/',
  build: {
    outDir: 'dist',
  },
  // When dev server proxies API calls to the FastAPI backend
  server: {
    proxy: {
      '/api': 'http://localhost:8765',
      '/epics': 'http://localhost:8765',
      '/tasks': 'http://localhost:8765',
      '/agents': 'http://localhost:8765',
      '/stats': 'http://localhost:8765',
      '/versions': 'http://localhost:8765',
      '/projects': 'http://localhost:8765',
      '/decisions': 'http://localhost:8765',
      '/events': 'http://localhost:8765',
      '/health': 'http://localhost:8765',
    },
  },
})
