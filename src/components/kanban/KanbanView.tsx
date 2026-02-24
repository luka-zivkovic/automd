import { useUiStore } from '@/store/ui-store'
import { KanbanBoard } from './KanbanBoard'
import { CardPreferences } from '@/components/settings/CardPreferences'
import { FilterBar } from '@/components/search/FilterBar'
import { SplitView } from '@/components/editor/SplitView'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { Code2, X } from 'lucide-react'

function SplitEditorToggle() {
  const showSplitEditor = useUiStore((s) => s.showSplitEditor)
  const toggleSplitEditor = useUiStore((s) => s.toggleSplitEditor)

  return (
    <button
      onClick={toggleSplitEditor}
      title={showSplitEditor ? 'Hide markdown editor' : 'Show markdown editor'}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/40 whitespace-nowrap"
    >
      {showSplitEditor ? <X className="size-3.5" /> : <Code2 className="size-3.5" />}
      <span className="hidden sm:inline">{showSplitEditor ? 'Hide editor' : 'Editor'}</span>
    </button>
  )
}

export function KanbanView() {
  const showSplitEditor = useUiStore((s) => s.showSplitEditor)

  const kanban = (
    <div className="flex flex-col h-full">
      <FilterBar>
        <SplitEditorToggle />
      </FilterBar>
      <div className="flex justify-end px-4 pt-2">
        <CardPreferences />
      </div>
      <div className="flex-1 min-h-0">
        <KanbanBoard />
      </div>
    </div>
  )

  if (showSplitEditor) {
    return <SplitView left={<MarkdownEditor />} right={kanban} />
  }

  return kanban
}
