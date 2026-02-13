import { useDocumentStore } from '@/store/document-store'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TaskGroup } from './TaskGroup'
import { ClipboardList } from 'lucide-react'

export function ChecklistView() {
  const columns = useDocumentStore((s) => s.columns)

  if (columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
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
    )
  }

  const allTasks = columns.flatMap((c) => c.tasks)
  const totalCompleted = allTasks.filter((t) => t.checked).length
  const totalTasks = allTasks.length
  const overallPercent =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0

  return (
    <ScrollArea className="h-full">
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

        {/* Task groups */}
        <div className="space-y-4 stagger-enter">
          {columns.map((col) => (
            <TaskGroup key={col.id} column={col} />
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
