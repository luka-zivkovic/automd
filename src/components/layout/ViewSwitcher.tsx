import { useUiStore, type ViewMode } from '@/store/ui-store'
import { useFilesStore } from '@/store/files-store'
import { useBoardVocabulary } from '@/hooks/useBoardVocabulary'
import type { ItemType } from '@/lib/markdown/types'
import { FileText, CheckSquare, Columns3 } from 'lucide-react'

const FILE_VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Editor', icon: <FileText className="size-4" /> },
  { id: 'checklist', label: 'Checklist', icon: <CheckSquare className="size-4" /> },
  { id: 'kanban', label: 'Kanban', icon: <Columns3 className="size-4" /> },
]

const TYPE_VIEWS: Record<ItemType, ViewMode[]> = {
  board: ['editor', 'checklist', 'kanban'],
  checklist: ['editor', 'checklist'],
  note: ['editor'],
}

export function ViewSwitcher() {
  const { activeView, setActiveView } = useUiStore()
  const { availableViews } = useBoardVocabulary()
  const files = useFilesStore((s) => s.files)
  const activeFileId = useFilesStore((s) => s.activeFileId)

  // Don't show view switcher on non-file views
  if (activeView === 'home' || activeView === 'project-home' || activeView === 'memory') {
    return null
  }

  const activeFile = files.find((f) => f.id === activeFileId)
  const itemType: ItemType = activeFile?.itemType ?? 'board'
  const typeAllowed = TYPE_VIEWS[itemType]

  // Filter: itemType restricts base views, vocabulary can further restrict
  const filtered = FILE_VIEWS.filter((v) => {
    if (!typeAllowed.includes(v.id)) return false
    if (availableViews.length > 0 && availableViews.length < FILE_VIEWS.length) {
      return availableViews.includes(v.id)
    }
    return true
  })

  // Don't show switcher if only one view available
  if (filtered.length <= 1) return null

  return (
    <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
      {filtered.map((view) => {
        const isActive = activeView === view.id
        return (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`
              relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
              ${isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
              }
            `}
          >
            {view.icon}
            <span className="hidden sm:inline">{view.label}</span>
          </button>
        )
      })}
    </div>
  )
}
