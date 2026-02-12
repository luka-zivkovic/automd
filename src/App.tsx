import { useEffect } from 'react'
import { useUiStore } from '@/store/ui-store'
import { useConnectionStore } from '@/store/connection-store'
import { useAuthStore } from '@/store/auth-store'
import { Header } from '@/components/layout/Header'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { EditorView } from '@/components/editor/EditorView'
import { ChecklistView } from '@/components/checklist/ChecklistView'
import { KanbanView } from '@/components/kanban/KanbanView'
import { FileDropZone } from '@/components/editor/FileDropZone'
import { TaskDetailPanel } from '@/components/detail/TaskDetailPanel'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { CommandPalette } from '@/components/search/CommandPalette'
import { LoadingSkeleton } from '@/components/layout/LoadingSkeleton'
import { ActivityFeed } from '@/components/activity/ActivityFeed'
import { UpdateBanner } from '@/components/layout/UpdateBanner'
import { SetupPage } from '@/components/auth/SetupPage'
import { LoginPage } from '@/components/auth/LoginPage'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useActiveFileSync } from '@/hooks/useActiveFileSync'
import { useServerSync } from '@/hooks/useServerSync'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { API_BASE } from '@/lib/api'

const HAS_SERVER = !!import.meta.env.VITE_AUTOMD_SERVER

function App() {
  const activeView = useUiStore((s) => s.activeView)
  const isLoading = useConnectionStore((s) => s.isLoading)
  const authStatus = useAuthStore((s) => s.status)
  useKeyboardShortcuts()
  useActiveFileSync()
  useServerSync()

  // Check auth status on mount
  useEffect(() => {
    if (!HAS_SERVER) {
      // Local-only mode — no auth needed
      useAuthStore.getState().setStatus('authenticated')
      return
    }

    async function checkAuth() {
      try {
        const res = await fetch(`${API_BASE}/auth/status`)
        const data = await res.json()

        if (!data.authEnabled) {
          // Auth disabled on server (AUTOMD_DISABLE_AUTH=true or no admin yet and auth not required)
          useAuthStore.getState().setStatus('authenticated')
          return
        }

        if (!data.setupComplete) {
          useAuthStore.getState().setStatus('needs-setup')
          return
        }

        // Auth is enabled — validate existing token if we have one
        const storedToken = useAuthStore.getState().token
        if (storedToken) {
          const meRes = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${storedToken}` },
          })
          if (meRes.ok) {
            const me = await meRes.json()
            useAuthStore.getState().setAuth(storedToken, me.email)
            return
          }
        }

        // No valid token — need to log in
        useAuthStore.getState().clearAuth()
      } catch {
        // Server unreachable — if we have a token, try to use it
        if (useAuthStore.getState().token) {
          useAuthStore.getState().setStatus('authenticated')
        } else {
          useAuthStore.getState().setStatus('unauthenticated')
        }
      }
    }

    checkAuth()
  }, [])

  // Auth gating for server mode
  if (HAS_SERVER) {
    if (authStatus === 'loading') {
      return (
        <div className="h-screen flex items-center justify-center bg-background paper-texture">
          <LoadingSkeleton />
        </div>
      )
    }
    if (authStatus === 'needs-setup') return <SetupPage />
    if (authStatus === 'unauthenticated') return <LoginPage />
  }

  const showSkeleton = isLoading && HAS_SERVER

  return (
    <TooltipProvider>
      <FileDropZone>
        <div className="h-screen flex flex-col bg-background text-foreground paper-texture">
          <Header />
          <UpdateBanner />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-hidden">
              {showSkeleton ? (
                <LoadingSkeleton />
              ) : (
                <>
                  {activeView === 'dashboard' && <DashboardView />}
                  {activeView === 'editor' && <EditorView />}
                  {activeView === 'checklist' && <ChecklistView />}
                  {activeView === 'kanban' && <KanbanView />}
                </>
              )}
            </main>
            <ActivityFeed />
          </div>
          <TaskDetailPanel />
        </div>
        <Toaster position="bottom-right" />
        <CommandPalette />
      </FileDropZone>
    </TooltipProvider>
  )
}

export default App
