import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { Column } from '@/lib/markdown/types'
import { KanbanCard } from './KanbanCard'
import { ColumnHeader } from './ColumnHeader'
import { AddTaskInput } from '../checklist/AddTaskInput'

interface KanbanColumnProps {
  column: Column
}

export function KanbanColumn({ column }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', column },
  })

  const taskIds = column.tasks.map((t) => t.id)

  return (
    <div
      className={`flex flex-col w-[280px] min-w-[280px] bg-card rounded-xl border transition-all duration-200 ${
        isOver
          ? 'border-primary/40 shadow-md shadow-primary/5'
          : 'border-border shadow-sm'
      }`}
    >
      <ColumnHeader column={column} />

      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-2.5 py-2 min-h-24"
      >
        <SortableContext
          items={taskIds}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <KanbanCard key={task.id} task={task} />
          ))}
        </SortableContext>

        {column.tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/60 italic">
            Drop tasks here
          </div>
        )}
      </div>

      <div className="px-3 pb-3">
        <AddTaskInput columnId={column.id} />
      </div>
    </div>
  )
}
