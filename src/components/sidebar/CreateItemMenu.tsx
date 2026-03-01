import { useState, useRef, useEffect, useCallback } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { ITEM_TYPE_DEFAULTS } from '@/lib/templates'
import { TemplatePicker } from './TemplatePicker'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, Columns3, CheckSquare, FileText, LayoutTemplate } from 'lucide-react'
import type { ItemType } from '@/lib/markdown/types'
import type { BoardTemplate } from '@/lib/templates'

const ITEM_OPTIONS: { type: ItemType; label: string; icon: React.ReactNode }[] = [
  { type: 'board', label: 'Board', icon: <Columns3 className="size-4" /> },
  { type: 'checklist', label: 'Checklist', icon: <CheckSquare className="size-4" /> },
  { type: 'note', label: 'Note', icon: <FileText className="size-4" /> },
]

const DEFAULT_VIEWS: Record<ItemType, 'kanban' | 'checklist' | 'editor'> = {
  board: 'kanban',
  checklist: 'checklist',
  note: 'editor',
}

interface CreateItemMenuProps {
  projectId?: string | null
  className?: string
}

export function CreateItemMenu({ projectId, className }: CreateItemMenuProps) {
  const [open, setOpen] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const createFile = useFilesStore((s) => s.createFile)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const moveFileToProject = useFilesStore((s) => s.moveFileToProject)
  const setActiveView = useUiStore((s) => s.setActiveView)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleCreate = useCallback((type: ItemType) => {
    const defaults = ITEM_TYPE_DEFAULTS[type]
    const fileId = createFile(defaults.name, defaults.markdown, type)
    if (projectId) {
      moveFileToProject(fileId, projectId)
    }
    setActiveFile(fileId)
    setActiveView(DEFAULT_VIEWS[type])
    setOpen(false)
  }, [createFile, moveFileToProject, setActiveFile, setActiveView, projectId])

  const handleSelectTemplate = useCallback((template: BoardTemplate) => {
    const fileId = createFile(template.name, template.markdown)
    if (projectId) {
      moveFileToProject(fileId, projectId)
    }
    setActiveFile(fileId)
    setActiveView('kanban')
    setShowTemplatePicker(false)
    setOpen(false)
  }, [createFile, moveFileToProject, setActiveFile, setActiveView, projectId])

  return (
    <div className="relative" ref={menuRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
              setShowTemplatePicker(false)
            }}
            className={className ?? 'text-muted-foreground hover:text-foreground'}
          >
            <Plus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">New item</TooltipContent>
      </Tooltip>

      {open && !showTemplatePicker && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
          {ITEM_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs text-foreground hover:bg-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                handleCreate(opt.type)
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setShowTemplatePicker(true)
            }}
          >
            <LayoutTemplate className="size-4" />
            From Template...
          </button>
        </div>
      )}

      {showTemplatePicker && (
        <TemplatePicker
          onSelect={handleSelectTemplate}
          onClose={() => {
            setShowTemplatePicker(false)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
