import { useDocumentStore } from '@/store/document-store'
import { useUiStore } from '@/store/ui-store'
import { useFilteredColumns } from '@/hooks/useFilteredColumns'
import { useBoardVocabulary } from '@/hooks/useBoardVocabulary'
import { Progress } from '@/components/ui/progress'
import { TaskGroup } from './TaskGroup'
import { FilterBar } from '@/components/search/FilterBar'
import { SplitView } from '@/components/editor/SplitView'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { ClipboardList, Code2, X } from 'lucide-react'

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

export function ChecklistView() {
  const showSplitEditor = useUiStore((s) => s.showSplitEditor)
  const columns = useDocumentStore((s) => s.columns)

  const filteredColumns = useFilteredColumns(columns)
  const { hideCompletion, itemLabel } = useBoardVocabulary()

  const allTasks = filteredColumns.flatMap((c) => c.tasks)
  const totalCompleted = allTasks.filter((t) => t.checked === true).length
  const totalTasks = allTasks.length
  const overallPercent =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0

  const checklist = (
    <div className="flex flex-col h-full">
      <FilterBar>
        <SplitEditorToggle />
      </FilterBar>
      {columns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <ClipboardList className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">No tasks yet</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Write markdown with{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">
                # Column
              </code>{' '}
              for columns and{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">
                ## Task
              </code>{' '}
              for tasks.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-2xl mx-auto px-6 py-8">
            {/* Overall progress */}
            {!hideCompletion && (
              <div className="mb-8">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <h2 className="font-display text-3xl text-foreground italic">Progress</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {totalCompleted} of {totalTasks} {itemLabel.toLowerCase()}s complete
                    </p>
                  </div>
                  <span className="text-3xl font-light tabular-nums text-gradient">
                    {overallPercent}%
                  </span>
                </div>
                <Progress value={overallPercent} className="h-2" />
              </div>
            )}

            {/* Task groups */}
            <div className="space-y-4 stagger-enter">
              {filteredColumns.map((col) => (
                <TaskGroup key={col.id} column={col} hideCompletion={hideCompletion} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (showSplitEditor) {
    return <SplitView left={<MarkdownEditor />} right={checklist} />
  }

  return checklist
}
