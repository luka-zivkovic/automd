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
import { API_BASE, HAS_SERVER } from '@/lib/api'

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

    async function checkAuth(retries = 5, delay = 1000) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(`${API_BASE}/auth/status`)
          const data = await res.json()

          if (!data.setupComplete) {
            useAuthStore.getState().setStatus('needs-setup')
            return
          }

          if (!data.authEnabled) {
            useAuthStore.getState().setStatus('authenticated')
            return
          }

          // Auth enabled — validate existing token
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

          useAuthStore.getState().clearAuth()
          return
        } catch {
          // Server unreachable — retry if we have attempts left
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delay))
            continue
          }
          // All retries exhausted
          if (useAuthStore.getState().token) {
            useAuthStore.getState().setStatus('authenticated')
          } else {
            useAuthStore.getState().setStatus('needs-setup')
          }
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
