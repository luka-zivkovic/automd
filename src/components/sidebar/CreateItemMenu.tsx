import { useState, useCallback, useRef, useEffect } from 'react'
import { useFilesStore } from '@/store/files-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus, LayoutGrid, CheckSquare, FileText, Brain } from 'lucide-react'
import { TemplatePicker } from './TemplatePicker'
import { BOARD_TEMPLATES, type BoardTemplate } from '@/lib/templates'

const PAGE_TEMPLATE = BOARD_TEMPLATES.find((t) => t.id === 'page')!
const KNOWLEDGE_TEMPLATE = BOARD_TEMPLATES.find((t) => t.id === 'knowledge')!

interface CreateItemMenuProps {
  projectId?: string | null
  onFileCreated?: () => void
}

export function CreateItemMenu({ projectId, onFileCreated }: CreateItemMenuProps) {
  const createFile = useFilesStore((s) => s.createFile)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const moveFileToProject = useFilesStore((s) => s.moveFileToProject)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const createAndAssign = useCallback((id: string) => {
    if (projectId) {
      moveFileToProject(id, projectId)
    }
    setActiveFile(id)
  }, [projectId, moveFileToProject, setActiveFile])

  const handleBoardClick = useCallback(() => {
    setMenuOpen(false)
    setPickerOpen(true)
  }, [])

  const handleSelectTemplate = useCallback(
    (template: BoardTemplate) => {
      const id = createFile(template.name, template.markdown, projectId ?? null, template.itemType)
      setActiveFile(id)
      setPickerOpen(false)
      onFileCreated?.()
    },
    [createFile, setActiveFile, projectId, onFileCreated]
  )

  const handleChecklist = useCallback(() => {
    setMenuOpen(false)
    const id = createFile('Untitled Checklist', `# Tasks\n\n## [ ] First item\n`, projectId ?? null, 'checklist')
    createAndAssign(id)
    onFileCreated?.()
  }, [createFile, createAndAssign, projectId, onFileCreated])

  const handlePage = useCallback(() => {
    setMenuOpen(false)
    const id = createFile('Untitled Page', PAGE_TEMPLATE.markdown, projectId ?? null, 'page')
    createAndAssign(id)
    onFileCreated?.()
  }, [createFile, createAndAssign, projectId, onFileCreated])

  const handleKnowledge = useCallback(() => {
    setMenuOpen(false)
    const id = createFile('Untitled Knowledge Base', KNOWLEDGE_TEMPLATE.markdown, projectId ?? null, 'knowledge')
    createAndAssign(id)
    onFileCreated?.()
  }, [createFile, createAndAssign, projectId, onFileCreated])

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">New Item</TooltipContent>
      </Tooltip>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        >
          <div className="p-1">
            <button
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent group"
              onClick={handleBoardClick}
            >
              <LayoutGrid className="size-3.5 text-primary" />
              <span className="text-sm font-medium">Board</span>
            </button>
            <button
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent group"
              onClick={handleChecklist}
            >
              <CheckSquare className="size-3.5 text-emerald-500" />
              <span className="text-sm font-medium">Checklist</span>
            </button>
            <button
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent group"
              onClick={handlePage}
            >
              <FileText className="size-3.5 text-amber-500" />
              <span className="text-sm font-medium">Page</span>
            </button>
            <button
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent group"
              onClick={handleKnowledge}
            >
              <Brain className="size-3.5 text-purple-500" />
              <span className="text-sm font-medium">Knowledge Base</span>
            </button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <TemplatePicker
          onSelect={handleSelectTemplate}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
