import { useEffect, useRef, useMemo } from 'react'
import {
  LayoutGrid,
  Zap,
  FolderKanban,
  User,
  File,
  Brain,
  Bug,
  TrendingUp,
  Calendar,
  MessageCircle,
  Target,
  CheckSquare,
  FileText,
  type LucideIcon,
} from 'lucide-react'
import type { BoardTemplate } from '@/lib/templates'
import { BOARD_TEMPLATES } from '@/lib/templates'

const ICON_MAP: Record<string, LucideIcon> = {
  'layout-grid': LayoutGrid,
  zap: Zap,
  'folder-kanban': FolderKanban,
  user: User,
  file: File,
  brain: Brain,
  bug: Bug,
  'trending-up': TrendingUp,
  calendar: Calendar,
  'message-circle': MessageCircle,
  target: Target,
  'check-square': CheckSquare,
  'file-text': FileText,
}

interface TemplatePickerProps {
  onSelect: (template: BoardTemplate) => void
  onClose: () => void
  filterItemType?: 'board' | 'checklist' | 'page' | 'knowledge'
}

export function TemplatePicker({ onSelect, onClose, filterItemType }: TemplatePickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const templates = useMemo(() => {
    if (filterItemType) {
      return BOARD_TEMPLATES.filter((t) => t.itemType === filterItemType)
    }
    return BOARD_TEMPLATES
  }, [filterItemType])

  const boardTemplates = useMemo(() => templates.filter((t) => t.itemType === 'board'), [templates])
  const checklistTemplates = useMemo(() => templates.filter((t) => t.itemType === 'checklist'), [templates])
  const pageTemplates = useMemo(() => templates.filter((t) => t.itemType === 'page'), [templates])
  const knowledgeTemplates = useMemo(() => templates.filter((t) => t.itemType === 'knowledge'), [templates])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const renderGroup = (label: string, items: BoardTemplate[]) => {
    if (items.length === 0) return null
    return (
      <div key={label}>
        {!filterItemType && (
          <div className="px-3 py-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
          </div>
        )}
        {items.map((template) => {
          const Icon = ICON_MAP[template.icon] ?? File
          return (
            <button
              key={template.id}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent group"
              onClick={() => onSelect(template)}
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/15">
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">
                  {template.name}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {template.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 z-50 w-72 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
    >
      <div className="px-3 py-2 border-b border-border sticky top-0 bg-popover z-10">
        <p className="text-xs font-semibold text-foreground">Choose a template</p>
      </div>
      <div className="p-1">
        {renderGroup('Boards', boardTemplates)}
        {renderGroup('Checklists', checklistTemplates)}
        {renderGroup('Pages', pageTemplates)}
        {renderGroup('Knowledge Bases', knowledgeTemplates)}
      </div>
    </div>
  )
}
