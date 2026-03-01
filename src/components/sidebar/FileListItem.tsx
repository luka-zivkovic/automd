import { useState, useRef, useEffect, useCallback } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { Button } from '@/components/ui/button'
import { GripVertical, MoreHorizontal, Pencil, Trash2, Columns3, CheckSquare, FileText } from 'lucide-react'
import type { BoardFile, ItemType } from '@/lib/markdown/types'
import { formatRelativeDate } from '@/lib/format-relative-date'

const TYPE_ICONS: Record<ItemType, React.ReactNode> = {
  board: <Columns3 className="size-3.5 text-muted-foreground/60" />,
  checklist: <CheckSquare className="size-3.5 text-muted-foreground/60" />,
  note: <FileText className="size-3.5 text-muted-foreground/60" />,
}

const DEFAULT_VIEWS: Record<ItemType, 'kanban' | 'checklist' | 'editor'> = {
  board: 'kanban',
  checklist: 'checklist',
  note: 'editor',
}

interface FileListItemProps {
  file: BoardFile
  isActive: boolean
  isDragOverlay?: boolean
}

export function FileListItem({ file, isActive, isDragOverlay = false }: FileListItemProps) {
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const renameFile = useFilesStore((s) => s.renameFile)
  const deleteFile = useFilesStore((s) => s.deleteFile)
  const setActiveView = useUiStore((s) => s.setActiveView)

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(file.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const itemType: ItemType = file.itemType ?? 'board'

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: file.id,
    data: { type: 'sidebar-file', file },
    disabled: isDragOverlay || isRenaming,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleClick = useCallback(() => {
    if (!isRenaming) {
      setActiveFile(file.id)
      setActiveView(DEFAULT_VIEWS[itemType])
    }
  }, [file.id, isRenaming, setActiveFile, setActiveView, itemType])

  const handleDoubleClick = useCallback(() => {
    setRenameValue(file.name)
    setIsRenaming(true)
    setMenuOpen(false)
  }, [file.name])

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== file.name) {
      renameFile(file.id, trimmed)
    }
    setIsRenaming(false)
  }, [renameValue, file.name, file.id, renameFile])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename()
      } else if (e.key === 'Escape') {
        setIsRenaming(false)
        setRenameValue(file.name)
      }
    },
    [commitRename, file.name]
  )

  const handleDelete = useCallback(() => {
    setMenuOpen(false)
    deleteFile(file.id)
  }, [file.id, deleteFile])

  const handleStartRename = useCallback(() => {
    setMenuOpen(false)
    setRenameValue(file.name)
    setIsRenaming(true)
  }, [file.name])

  return (
    <div>
      <div
        ref={setNodeRef}
        style={isDragOverlay ? undefined : style}
        {...(isDragOverlay ? {} : attributes)}
        className={`
          group relative flex items-center gap-1.5 px-2.5 py-2 rounded-md cursor-pointer
          transition-colors duration-150
          ${isDragOverlay
            ? 'bg-background border border-border shadow-lg ring-2 ring-primary/30 scale-[1.02]'
            : isActive
              ? 'bg-primary/10 text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }
          ${isDragging ? 'z-10' : ''}
        `}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
      >
        {/* Drag handle */}
        {!isRenaming && !isDragOverlay && (
          <div
            className="shrink-0 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-opacity duration-150"
            {...listeners}
          >
            <GripVertical className="size-3" />
          </div>
        )}

        {/* Type icon */}
        <div className="shrink-0">
          {TYPE_ICONS[itemType]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              ref={inputRef}
              className="w-full text-sm bg-background border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleRenameKeyDown}
            />
          ) : (
            <>
              <div className="text-sm font-medium truncate">{file.name}</div>
              {!isDragOverlay && (
                <div className="text-[11px] text-muted-foreground/70 truncate">
                  {formatRelativeDate(file.updatedAt)}
                </div>
              )}
            </>
          )}
        </div>

        {/* More button */}
        {!isRenaming && !isDragOverlay && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((v) => !v)
            }}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        )}

        {/* Dropdown menu */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border border-border bg-popover p-1 shadow-md"
          >
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                handleStartRename()
              }}
            >
              <Pencil className="size-3" />
              Rename
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete()
              }}
            >
              <Trash2 className="size-3" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
