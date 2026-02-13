import { useState, useMemo } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { useFilteredColumns } from '@/hooks/useFilteredColumns'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { TaskGroup } from './TaskGroup'
import { FilterBar } from '@/components/search/FilterBar'
import { ClipboardList, Archive } from 'lucide-react'

export function ChecklistView() {
  const columns = useDocumentStore((s) => s.columns)
  const [showArchived, setShowArchived] = useState(false)

  const archivedCount = useMemo(
    () => columns.flatMap((c) => c.tasks).filter((t) => t.metadata.archived).length,
    [columns]
  )

  const archiveFilteredColumns = useMemo(
    () =>
      showArchived
        ? columns
        : columns.map((col) => ({
            ...col,
            tasks: col.tasks.filter((t) => !t.metadata.archived),
          })),
    [columns, showArchived]
  )

  // Apply search/filter-store filters on top of archive filtering
  const filteredColumns = useFilteredColumns(archiveFilteredColumns)

  if (columns.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <FilterBar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <ClipboardList className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">No tasks yet</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Switch to the Editor and write markdown with{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">
                - [ ] Task name
              </code>{' '}
              to get started.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const allTasks = filteredColumns.flatMap((c) => c.tasks)
  const totalCompleted = allTasks.filter((t) => t.checked).length
  const totalTasks = allTasks.length
  const overallPercent =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      <FilterBar />
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {/* Overall progress */}
          <div className="mb-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-display text-3xl text-foreground italic">Progress</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalCompleted} of {totalTasks} tasks complete
                </p>
              </div>
              <span className="text-3xl font-light tabular-nums text-gradient">
                {overallPercent}%
              </span>
            </div>
            <Progress value={overallPercent} className="h-2" />
          </div>

          {/* Archived toggle */}
          {archivedCount > 0 && (
            <div className="mb-4">
              <Button
                variant={showArchived ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
                className="text-xs text-muted-foreground"
              >
                <Archive className="size-3" />
                {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
              </Button>
            </div>
          )}

          {/* Task groups */}
          <div className="space-y-4 stagger-enter">
            {filteredColumns.map((col) => (
              <TaskGroup key={col.id} column={col} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
