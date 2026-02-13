import { useUiStore } from '@/store/ui-store'
import { Header } from '@/components/layout/Header'
import { EditorView } from '@/components/editor/EditorView'
import { ChecklistView } from '@/components/checklist/ChecklistView'
import { KanbanView } from '@/components/kanban/KanbanView'
import { FileDropZone } from '@/components/editor/FileDropZone'
import { TaskDetailPanel } from '@/components/detail/TaskDetailPanel'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { CommandPalette } from '@/components/search/CommandPalette'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useActiveFileSync } from '@/hooks/useActiveFileSync'
import { useServerSync } from '@/hooks/useServerSync'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'

function App() {
  const activeView = useUiStore((s) => s.activeView)
  useKeyboardShortcuts()
  useActiveFileSync()
  useServerSync()

  return (
    <TooltipProvider>
      <FileDropZone>
        <div className="h-screen flex flex-col bg-background text-foreground paper-texture">
          <Header />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-hidden">
              {activeView === 'editor' && <EditorView />}
              {activeView === 'checklist' && <ChecklistView />}
              {activeView === 'kanban' && <KanbanView />}
            </main>
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
