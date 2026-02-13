import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useDocumentStore } from '@/store/document-store'
import type { Task } from '@/lib/markdown/types'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { Columns3 } from 'lucide-react'

export function KanbanBoard() {
  const columns = useDocumentStore((s) => s.columns)
  const moveTask = useDocumentStore((s) => s.moveTask)
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const taskColumnMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const col of columns) {
      for (const task of col.tasks) {
        map.set(task.id, col.id)
      }
    }
    return map
  }, [columns])

  function findColumnId(taskOrColumnId: string): string | undefined {
    if (taskOrColumnId.startsWith('column-')) {
      return taskOrColumnId.replace('column-', '')
    }
    return taskColumnMap.get(taskOrColumnId)
  }

  // Custom collision detection: try pointer-based first, fall back to rect intersection
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions

    const rectCollisions = rectIntersection(args)
    if (rectCollisions.length > 0) return rectCollisions

    return closestCenter(args)
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task | undefined
    if (task) setActiveTask(task)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const sourceColumnId = findColumnId(activeId)
    const targetColumnId = findColumnId(overId)

    if (!sourceColumnId || !targetColumnId) return
    if (sourceColumnId === targetColumnId) return

    // Cross-column move during drag for visual feedback
    const targetColumn = columns.find((c) => c.id === targetColumnId)
    if (!targetColumn) return

    let targetIndex: number
    if (overId.startsWith('column-')) {
      targetIndex = targetColumn.tasks.length
    } else {
      targetIndex = targetColumn.tasks.findIndex((t) => t.id === overId)
      if (targetIndex === -1) targetIndex = targetColumn.tasks.length
    }

    moveTask(activeId, targetColumnId, targetIndex)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string

    const sourceColumnId = findColumnId(activeId)
    const targetColumnId = findColumnId(overId)

    if (!sourceColumnId || !targetColumnId) return

    const targetColumn = columns.find((c) => c.id === targetColumnId)
    if (!targetColumn) return

    let targetIndex: number
    if (overId.startsWith('column-')) {
      targetIndex = targetColumn.tasks.length
    } else {
      targetIndex = targetColumn.tasks.findIndex((t) => t.id === overId)
      if (targetIndex === -1) targetIndex = targetColumn.tasks.length
    }

    if (sourceColumnId === targetColumnId) {
      const currentIndex = targetColumn.tasks.findIndex(
        (t) => t.id === activeId
      )
      if (currentIndex === targetIndex) return
    }

    moveTask(activeId, targetColumnId, targetIndex)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-5 p-6 h-full overflow-x-auto">
        {columns.map((col) => (
          <KanbanColumn key={col.id} column={col} />
        ))}

        {columns.length === 0 && (
          <div className="flex items-center justify-center w-full">
            <div className="text-center max-w-sm">
              <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
                <Columns3 className="size-7 text-muted-foreground" />
              </div>
              <h3 className="font-display text-2xl text-foreground italic">No columns yet</h3>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Use <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">## Heading</code>{' '}
                in your markdown to create kanban columns.
              </p>
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && <KanbanCard task={activeTask} isDragOverlay />}
      </DragOverlay>
    </DndContext>
  )
}
