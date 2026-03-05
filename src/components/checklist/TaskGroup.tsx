import { useState } from 'react'
import type { Column } from '@/lib/markdown/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { TaskItem } from './TaskItem'
import { RichTaskInput } from '@/components/input/RichTaskInput'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface TaskGroupProps {
  column: Column
  isKnowledge?: boolean
}

function countAllTasks(column: Column): { completed: number; total: number } {
  let completed = 0
  let total = 0

  function count(tasks: typeof column.tasks) {
    for (const task of tasks) {
      total++
      if (task.checked === true) completed++
      count(task.children)
    }
  }

  count(column.tasks)
  return { completed, total }
}

export function TaskGroup({ column, isKnowledge }: TaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { completed, total } = countAllTasks(column)
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <Card className="card-hover overflow-hidden">
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2.5">
            <div className="text-muted-foreground transition-transform duration-200">
              {collapsed ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </div>
            <h3 className="font-display text-lg text-foreground italic">{column.title}</h3>
          </div>
          {!isKnowledge && (
            <div className="flex items-center gap-3">
              <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums font-medium text-muted-foreground min-w-[3ch] text-right">
                {completed}/{total}
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0">
          <div className="space-y-0.5">
            {column.tasks.map((task) => (
              <TaskItem key={task.id} task={task} isKnowledge={isKnowledge} />
            ))}
          </div>
          <RichTaskInput columnId={column.id} />
        </CardContent>
      )}
    </Card>
  )
}
