import { useState, useRef, useEffect, useCallback } from 'react'
import { useUiStore } from '@/store/ui-store'
import { useDocumentStore } from '@/store/document-store'
import { serializeMetadata } from '@/lib/markdown/metadata-serializer'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DescriptionEditor } from './DescriptionEditor'
import { MetadataFieldEditor } from './MetadataFieldEditor'
import { SubtaskList } from './SubtaskList'
import { X, Trash2, Archive, ArchiveRestore } from 'lucide-react'

export function TaskDetailPanel() {
  const selectedTaskId = useUiStore((s) => s.selectedTaskId)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const taskMap = useDocumentStore((s) => s.taskMap)
  const toggleTask = useDocumentStore((s) => s.toggleTask)
  const updateTaskContent = useDocumentStore((s) => s.updateTaskContent)
  const deleteTask = useDocumentStore((s) => s.deleteTask)
  const archiveTask = useDocumentStore((s) => s.archiveTask)
  const unarchiveTask = useDocumentStore((s) => s.unarchiveTask)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const task = selectedTaskId ? taskMap.get(selectedTaskId) ?? null : null

  // Sync title from task when task changes
  useEffect(() => {
    if (task) {
      setTitleValue(task.displayContent)
    }
  }, [task?.displayContent, task?.id])

  // Reset delete confirmation when panel opens/closes
  useEffect(() => {
    setConfirmDelete(false)
  }, [selectedTaskId])

  // Close panel on Escape
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTaskId) {
        setSelectedTaskId(null)
      }
    },
    [selectedTaskId, setSelectedTaskId]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [handleEscape])

  if (!selectedTaskId || !task) return null

  function handleTitleSave() {
    if (!task) return
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== task.displayContent) {
      const serialized = serializeMetadata(trimmed, task.metadata)
      updateTaskContent(task.id, serialized)
    } else {
      // Reset to current value if empty
      setTitleValue(task.displayContent)
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTitleSave()
      titleRef.current?.blur()
    } else if (e.key === 'Escape') {
      setTitleValue(task!.displayContent)
      titleRef.current?.blur()
    }
  }

  function handleArchiveToggle() {
    if (task!.metadata.archived) {
      unarchiveTask(task!.id)
    } else {
      archiveTask(task!.id)
      setSelectedTaskId(null)
    }
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    deleteTask(task!.id)
    setSelectedTaskId(null)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-none md:pointer-events-none"
        onClick={() => setSelectedTaskId(null)}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-[400px] bg-background border-l border-border shadow-xl detail-panel-enter flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Task Detail
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setSelectedTaskId(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1">
          <div className="px-5 pb-6 space-y-5">
            {/* Title row: checkbox + editable title */}
            <div className="flex items-start gap-3 pt-1">
              <Checkbox
                checked={task.checked}
                onCheckedChange={() => toggleTask(task.id)}
                className="mt-1.5 shrink-0"
              />
              <input
                ref={titleRef}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                className="flex-1 text-lg font-display italic bg-transparent outline-none border-b border-transparent focus:border-ring transition-colors duration-150 pb-0.5 text-foreground placeholder:text-muted-foreground/50"
                placeholder="Task title..."
              />
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Description
              </h4>
              <DescriptionEditor
                taskId={task.id}
                description={task.description}
              />
            </div>

            <Separator />

            {/* Metadata */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Details
              </h4>
              <MetadataFieldEditor taskId={task.id} task={task} />
            </div>

            {/* Subtasks */}
            {task.children.length > 0 && (
              <>
                <Separator />
                <SubtaskList subtasks={task.children} />
              </>
            )}

            <Separator />

            {/* Archive */}
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleArchiveToggle}
                className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
              >
                {task.metadata.archived ? (
                  <>
                    <ArchiveRestore className="size-3.5" />
                    Unarchive task
                  </>
                ) : (
                  <>
                    <Archive className="size-3.5" />
                    Archive task
                  </>
                )}
              </Button>
            </div>

            {/* Delete */}
            <div className="pt-1">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-destructive">
                    Are you sure?
                  </span>
                  <Button
                    variant="destructive"
                    size="xs"
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-150"
                >
                  <Trash2 className="size-3.5" />
                  Delete task
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  )
}
