import { useUiStore } from '@/store/ui-store'
import { Header } from '@/components/layout/Header'
import { EditorView } from '@/components/editor/EditorView'
import { ChecklistView } from '@/components/checklist/ChecklistView'
import { KanbanView } from '@/components/kanban/KanbanView'
import { FileDropZone } from '@/components/editor/FileDropZone'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'sonner'

function App() {
  const activeView = useUiStore((s) => s.activeView)
  useKeyboardShortcuts()

  return (
    <TooltipProvider>
      <FileDropZone>
        <div className="h-screen flex flex-col bg-background text-foreground paper-texture">
          <Header />
          <main className="flex-1 overflow-hidden">
            {activeView === 'editor' && <EditorView />}
            {activeView === 'checklist' && <ChecklistView />}
            {activeView === 'kanban' && <KanbanView />}
          </main>
        </div>
        <Toaster position="bottom-right" />
      </FileDropZone>
    </TooltipProvider>
  )
}

export default App
