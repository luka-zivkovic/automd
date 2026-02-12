import { useDocumentStore } from '@/store/document-store'
import { useUiStore } from '@/store/ui-store'
import { Checkbox } from '@/components/ui/checkbox'
import type { Task } from '@/lib/markdown/types'
import { ChevronRight } from 'lucide-react'

interface SubtaskListProps {
  subtasks: Task[]
}

export function SubtaskList({ subtasks }: SubtaskListProps) {
  const toggleSubtask = useDocumentStore((s) => s.toggleSubtask)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  if (subtasks.length === 0) return null

  const completed = subtasks.filter((s) => s.checked === true).length

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Subtasks
        </h4>
        <span className="text-xs tabular-nums text-muted-foreground">
          {completed}/{subtasks.length}
        </span>
      </div>

      {subtasks.map((subtask) => (
        <div
          key={subtask.id}
          className="group flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors duration-150 cursor-pointer"
          onClick={() => setSelectedTaskId(subtask.id)}
        >
          <Checkbox
            checked={subtask.checked === true}
            onCheckedChange={() => toggleSubtask(subtask.id)}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0"
          />
          <span
            className={`flex-1 text-sm leading-snug transition-colors duration-200 ${
              subtask.checked === true
                ? 'line-through text-muted-foreground/60'
                : 'text-foreground'
            }`}
          >
            {subtask.displayContent}
          </span>
          <ChevronRight className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors duration-150 shrink-0" />
        </div>
      ))}
    </div>
  )
}
