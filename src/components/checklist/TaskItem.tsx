import { useState, useRef, useEffect } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { useUiStore } from '@/store/ui-store'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import type { Task } from '@/lib/markdown/types'
import { Trash2, Maximize2, Archive } from 'lucide-react'

interface TaskItemProps {
  task: Task
}

export function TaskItem({ task }: TaskItemProps) {
  const toggleTask = useDocumentStore((s) => s.toggleTask)
  const updateTaskContent = useDocumentStore((s) => s.updateTaskContent)
  const deleteTask = useDocumentStore((s) => s.deleteTask)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.content)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  function handleSave() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.content) {
      updateTaskContent(task.id, trimmed)
    }
    setIsEditing(false)
    setEditValue(task.content)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(task.content)
    }
  }

  return (
    <div>
      <div className={`group flex items-start gap-2.5 py-2 px-2 -mx-2 rounded-lg hover:bg-accent/40 transition-colors duration-150 ${task.metadata.archived ? 'opacity-50' : ''}`}>
        <Checkbox
          checked={task.checked}
          onCheckedChange={() => toggleTask(task.id)}
          className="mt-0.5"
        />

        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm bg-background border border-ring rounded-md px-2.5 py-0.5 outline-none focus:ring-2 focus:ring-ring/30"
          />
        ) : (
          <div className="flex-1 min-w-0">
            <span
              onDoubleClick={() => {
                setEditValue(task.content)
                setIsEditing(true)
              }}
              className={`text-sm cursor-default select-none leading-relaxed transition-colors duration-200 ${
                task.checked
                  ? 'line-through text-muted-foreground/60'
                  : 'text-foreground'
              }`}
            >
              {task.displayContent}
            </span>
            {task.metadata.archived && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5 ml-1.5 align-middle">
                <Archive className="size-2.5" />
                Archived
              </span>
            )}
            {task.metadata.labels.length > 0 && (
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {task.metadata.labels.map((label) => (
                  <span key={label} className="text-[10px] text-muted-foreground bg-secondary rounded px-1 py-0.5">
                    #{label}
                  </span>
                ))}
              </div>
            )}
            {task.description && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed line-clamp-1">
                {task.description}
              </p>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setSelectedTaskId(task.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          <Maximize2 className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => deleteTask(task.id)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {task.children.length > 0 && (
        <div className="ml-7 border-l-2 border-border/60 pl-3">
          {task.children.map((child) => (
            <TaskItem key={child.id} task={child} />
          ))}
        </div>
      )}
    </div>
  )
}
