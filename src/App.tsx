import { useUiStore } from '@/store/ui-store'
import { useConnectionStore } from '@/store/connection-store'
import { Header } from '@/components/layout/Header'
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
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useActiveFileSync } from '@/hooks/useActiveFileSync'
import { useServerSync } from '@/hooks/useServerSync'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'

function App() {
  const activeView = useUiStore((s) => s.activeView)
  const isLoading = useConnectionStore((s) => s.isLoading)
  useKeyboardShortcuts()
  useActiveFileSync()
  useServerSync()

  const showSkeleton = isLoading && !!import.meta.env.VITE_AUTOMD_SERVER

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
