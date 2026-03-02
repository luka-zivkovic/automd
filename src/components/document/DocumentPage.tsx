import { useDocumentStore } from '@/store/document-store'
import { useUiStore } from '@/store/ui-store'
import { renderMdast } from '@/lib/markdown/mdast-renderer'
import { FilterBar } from '@/components/search/FilterBar'
import { FileText, Code2, X } from 'lucide-react'

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

export function DocumentPage() {
  const ast = useDocumentStore((s) => s.ast)

  return (
    <div className="flex flex-col h-full">
      <FilterBar>
        <SplitEditorToggle />
      </FilterBar>

      {!ast || ast.children.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <FileText className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">Start writing</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Open the editor and write markdown. Headings, lists, code blocks, and more will render here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-8 py-10">
            {renderMdast(ast)}
          </div>
        </div>
      )}
    </div>
  )
}
