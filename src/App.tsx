import { useEffect } from 'react'
import { useUiStore } from '@/store/ui-store'
import { useFilesStore } from '@/store/files-store'
import { useConnectionStore } from '@/store/connection-store'
import { useAuthStore } from '@/store/auth-store'
import { Header } from '@/components/layout/Header'
import { DashboardView } from '@/components/dashboard/DashboardView'
import { EditorView } from '@/components/editor/EditorView'
import { ChecklistView } from '@/components/checklist/ChecklistView'
import { KanbanView } from '@/components/kanban/KanbanView'
import { DocumentView } from '@/components/document/DocumentView'
import { KnowledgeView } from '@/components/knowledge/KnowledgeView'
import { MemoryView } from '@/components/memory/MemoryView'
import { PromptLibrary } from '@/components/prompts/PromptLibrary'
import { ConnectView } from '@/components/connect/ConnectView'
import { SettingsView } from '@/components/settings/SettingsView'
import { AgentListView } from '@/components/agents/AgentListView'
import { AgentDetailView } from '@/components/agents/AgentDetailView'
import { InboxView } from '@/components/inbox/InboxView'
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
import { useUrlSync } from '@/hooks/useUrlSync'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'
import { API_BASE, HAS_SERVER } from '@/lib/api'

function App() {
  const activeView = useUiStore((s) => s.activeView)
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const isLoading = useConnectionStore((s) => s.isLoading)
  const authStatus = useAuthStore((s) => s.status)
  useKeyboardShortcuts()
  useActiveFileSync()
  useServerSync()
  useUrlSync()

  // Check auth status on mount
  useEffect(() => {
    if (!HAS_SERVER) {
      // Local-only mode — no auth needed
      useAuthStore.getState().setStatus('authenticated')
      return
    }

    async function checkAuth(retries = 3, delay = 1000) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        try {
          const res = await fetch(`${API_BASE}/auth/status`, {
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
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
            const meController = new AbortController()
            const meTimeoutId = setTimeout(() => meController.abort(), 5000)
            try {
              const meRes = await fetch(`${API_BASE}/auth/me`, {
                headers: { 'Authorization': `Bearer ${storedToken}` },
                signal: meController.signal,
              })
              if (meRes.ok) {
                const me = await meRes.json()
                useAuthStore.getState().setAuth(storedToken, me.email)
                return
              }
            } catch {
              throw new Error('auth/me timed out')
            } finally {
              clearTimeout(meTimeoutId)
            }
          }

          useAuthStore.getState().clearAuth()
          return
        } catch {
          clearTimeout(timeoutId)
          // Server unreachable or timed out — retry if we have attempts left
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delay))
            continue
          }
          // All retries exhausted — server unreachable
          if (useAuthStore.getState().token) {
            useAuthStore.getState().setStatus('authenticated')
          } else {
            useAuthStore.getState().setStatus('unauthenticated')
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
                  {activeView === 'settings' ? (
                    <SettingsView />
                  ) : activeView === 'inbox' ? (
                    <InboxView />
                  ) : activeView === 'agents' ? (
                    <AgentListView />
                  ) : activeView === 'memory' ? (
                    <MemoryView />
                  ) : activeView === 'connect' ? (
                    <ConnectView />
                  ) : activeView === 'prompts' ? (
                    <PromptLibrary />
                  ) : activeView === 'dashboard' || !activeFileId ? (
                    <DashboardView />
                  ) : activeView === 'document' ? (
                    <DocumentView />
                  ) : activeView === 'knowledge' ? (
                    <KnowledgeView />
                  ) : activeView === 'kanban' ? (
                    <KanbanView />
                  ) : activeView === 'editor' ? (
                    <EditorView />
                  ) : (
                    <ChecklistView />
                  )}
                </>
              )}
            </main>
            <ActivityFeed />
            <AgentDetailView />
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
