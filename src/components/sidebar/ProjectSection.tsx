import { useState, useCallback, useRef, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useFilesStore } from '@/store/files-store'
import { FileListItem } from './FileListItem'
import { CreateItemMenu } from './CreateItemMenu'
import { Button } from '@/components/ui/button'
import { ChevronRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { getProjectColorClass } from '@/lib/utils/project-colors'
import type { BoardFile, Project } from '@/lib/markdown/types'

interface ProjectSectionProps {
  project: Project
  files: BoardFile[]
  activeFileId: string | null
}

export function ProjectSection({ project, files, activeFileId }: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(project.name)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const renameProject = useFilesStore((s) => s.renameProject)
  const deleteProject = useFilesStore((s) => s.deleteProject)

  // Make the project file list area a droppable zone
  const { setNodeRef, isOver } = useDroppable({
    id: `project-${project.id}`,
    data: { type: 'sidebar-project', projectId: project.id },
  })

  const fileIds = files.map((f) => f.id)

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

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleToggleCollapse = useCallback(() => {
    if (!isRenaming) {
      setCollapsed((v) => !v)
    }
  }, [isRenaming])

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== project.name) {
      renameProject(project.id, trimmed)
    }
    setIsRenaming(false)
  }, [renameValue, project.name, project.id, renameProject])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        commitRename()
      } else if (e.key === 'Escape') {
        setIsRenaming(false)
        setRenameValue(project.name)
      }
    },
    [commitRename, project.name]
  )

  const handleStartRename = useCallback(() => {
    setMenuOpen(false)
    setRenameValue(project.name)
    setIsRenaming(true)
  }, [project.name])

  const handleDelete = useCallback(() => {
    setMenuOpen(false)
    deleteProject(project.id)
  }, [deleteProject, project.id])

  const colorClass = getProjectColorClass(project.color)

  // Auto-expand when dragging over a collapsed project
  useEffect(() => {
    if (isOver && collapsed) {
      const timer = setTimeout(() => setCollapsed(false), 400)
      return () => clearTimeout(timer)
    }
  }, [isOver, collapsed])

  return (
    <div ref={setNodeRef}>
      {/* Project header */}
      <div
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors duration-150 hover:bg-accent ${
          isOver ? 'bg-primary/10 ring-1 ring-primary/30' : ''
        }`}
        onClick={handleToggleCollapse}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
      >
        <ChevronRight
          className={`size-3 text-muted-foreground shrink-0 transition-transform duration-200 ${
            collapsed ? '' : 'rotate-90'
          }`}
        />
        <div className={`size-2.5 rounded-full shrink-0 ${colorClass}`} />

        {isRenaming ? (
          <input
            ref={inputRef}
            className="flex-1 min-w-0 text-xs font-semibold bg-background border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">
            {project.name}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
          {files.length}
        </span>

        {/* Action buttons */}
        {!isRenaming && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
            <CreateItemMenu projectId={project.id} onFileCreated={() => setCollapsed(false)} />
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
            >
              <MoreHorizontal className="size-3" />
            </Button>
          </div>
        )}

        {/* Context menu */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="absolute right-2 mt-16 z-50 w-36 rounded-md border border-border bg-popover p-1 shadow-md"
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

      {/* Nested file list */}
      {!collapsed && (
        <div
          className={`ml-3 pl-2.5 border-l transition-colors duration-150 ${
            isOver ? 'border-primary/50' : 'border-border/50'
          }`}
        >
          <SortableContext
            items={fileIds}
            strategy={verticalListSortingStrategy}
          >
            {files.length === 0 && (
              <p className={`text-[11px] px-2 py-2 ${
                isOver ? 'text-primary/70' : 'text-muted-foreground/60'
              }`}>
                {isOver ? 'Drop here...' : 'No boards in this project.'}
              </p>
            )}
            {files.map((file) => (
              <FileListItem
                key={file.id}
                file={file}
                isActive={file.id === activeFileId}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  )
}
