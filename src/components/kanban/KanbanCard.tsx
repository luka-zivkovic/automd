import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDocumentStore } from '@/store/document-store'
import { usePreferencesStore } from '@/store/preferences-store'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import type { Task } from '@/lib/markdown/types'
import { GripVertical } from 'lucide-react'
import { TaskMetadataDisplay } from './TaskMetadataDisplay'

interface KanbanCardProps {
  task: Task
  isDragOverlay?: boolean
}

export function KanbanCard({ task, isDragOverlay = false }: KanbanCardProps) {
  const toggleTask = useDocumentStore((s) => s.toggleTask)
  const cardDisplay = usePreferencesStore((s) => s.cardDisplay)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
    disabled: isDragOverlay,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  const subtaskCount = task.children.length
  const subtaskCompleted = task.children.filter((c) => c.checked).length

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 mb-1.5 group rounded-lg border bg-background transition-all duration-150 cursor-grab active:cursor-grabbing ${
        isDragOverlay
          ? 'kanban-card-dragging ring-2 ring-primary/50 scale-[1.02]'
          : 'border-border/60 hover:border-border hover:shadow-sm'
      } ${isDragging ? 'shadow-none border-transparent' : ''}`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 transition-opacity duration-150">
          <GripVertical className="size-3.5" />
        </div>

        <Checkbox
          checked={task.checked}
          onCheckedChange={() => toggleTask(task.id)}
          className="mt-0.5"
          onClick={(e) => e.stopPropagation()}
        />

        <span
          className={`text-sm leading-snug transition-colors duration-200 ${
            task.checked
              ? 'line-through text-muted-foreground/60'
              : 'text-foreground'
          }`}
        >
          {task.displayContent}
        </span>
      </div>

      <TaskMetadataDisplay metadata={task.metadata} prefs={cardDisplay} />

      {subtaskCount > 0 && cardDisplay.showSubtaskProgress && (
        <div className="mt-2 ml-9 flex items-center gap-2">
          <Progress
            value={(subtaskCompleted / subtaskCount) * 100}
            className="w-14 h-1"
          />
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {subtaskCompleted}/{subtaskCount}
          </span>
        </div>
      )}

      {task.description && (
        <p className="mt-1.5 ml-9 text-[11px] text-muted-foreground/70 leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}
    </div>
  )
}
