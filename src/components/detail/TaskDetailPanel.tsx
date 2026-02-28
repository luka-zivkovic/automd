import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useUiStore } from '@/store/ui-store'
import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'
import { serializeMetadata } from '@/lib/markdown/metadata-serializer'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DescriptionEditor } from './DescriptionEditor'
import { MetadataFieldEditor } from './MetadataFieldEditor'
import { SubtaskList } from './SubtaskList'
import { X, Trash2, Archive, Inbox, ArrowRight } from 'lucide-react'
import { apiFetch, HAS_SERVER } from '@/lib/api'

export function TaskDetailPanel() {
  const selectedTaskId = useUiStore((s) => s.selectedTaskId)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const taskMap = useDocumentStore((s) => s.taskMap)
  const toggleTask = useDocumentStore((s) => s.toggleTask)
  const updateTaskContent = useDocumentStore((s) => s.updateTaskContent)
  const deleteTask = useDocumentStore((s) => s.deleteTask)

  const activeFileId = useFilesStore((s) => s.activeFileId)
  const files = useFilesStore((s) => s.files)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [isMoving, setIsMoving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const task = selectedTaskId ? taskMap.get(selectedTaskId) ?? null : null

  // Determine board type: active, backlog, or archive
  const boardType = useMemo(() => {
    if (!activeFileId) return 'active' as const
    for (const file of files) {
      if (file.archiveBoardId === activeFileId) return 'archive' as const
      if (file.backlogBoardId === activeFileId) return 'backlog' as const
    }
    return 'active' as const
  }, [activeFileId, files])

  // Find the parent board ID (the "active" board that owns this archive/backlog)
  const parentBoardId = useMemo(() => {
    if (boardType === 'active') return activeFileId
    for (const file of files) {
      if (file.archiveBoardId === activeFileId || file.backlogBoardId === activeFileId) {
        return file.id
      }
    }
    return null
  }, [boardType, activeFileId, files])

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

  async function handleMoveToBoard(targetType: 'active' | 'archive' | 'backlog') {
    if (!task || !activeFileId || !parentBoardId || !HAS_SERVER || isMoving) return
    setIsMoving(true)

    try {
      let targetBoardId: string | null = null

      if (targetType === 'active') {
        targetBoardId = parentBoardId
      } else {
        const result = await apiFetch<{ id: string }>(`/files/${parentBoardId}/${targetType}`, {
          method: 'POST',
        })
        if (!result.ok) return
        targetBoardId = result.data.id
      }

      if (!targetBoardId || targetBoardId === activeFileId) return

      const result = await apiFetch(`/files/${activeFileId}/tasks/${task.id}/move-to/${targetBoardId}`, {
        method: 'POST',
      })

      if (result.ok) {
        setSelectedTaskId(null)
      }
    } finally {
      setIsMoving(false)
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
              {task.checked !== null && (
                <Checkbox
                  checked={task.checked}
                  onCheckedChange={() => toggleTask(task.id)}
                  className="mt-1.5 shrink-0"
                />
              )}
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

            {/* Move buttons — contextual based on board type */}
            {HAS_SERVER && (
              <div className="pt-1 space-y-1">
                {boardType === 'active' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isMoving}
                      onClick={() => handleMoveToBoard('backlog')}
                      className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
                    >
                      <Inbox className="size-3.5" />
                      Move to Backlog
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isMoving}
                      onClick={() => handleMoveToBoard('archive')}
                      className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
                    >
                      <Archive className="size-3.5" />
                      Archive
                    </Button>
                  </>
                )}
                {boardType === 'backlog' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isMoving}
                    onClick={() => handleMoveToBoard('active')}
                    className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
                  >
                    <ArrowRight className="size-3.5" />
                    Move to Active
                  </Button>
                )}
                {boardType === 'archive' && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isMoving}
                      onClick={() => handleMoveToBoard('active')}
                      className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
                    >
                      <ArrowRight className="size-3.5" />
                      Move to Active
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isMoving}
                      onClick={() => handleMoveToBoard('backlog')}
                      className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
                    >
                      <Inbox className="size-3.5" />
                      Move to Backlog
                    </Button>
                  </>
                )}
              </div>
            )}

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
