import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initTheme } from '@/store/theme-store'
import { migrateToMultiFile } from '@/lib/migration'
import App from './App.tsx'

initTheme()
migrateToMultiFile()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
