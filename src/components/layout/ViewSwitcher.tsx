import { useUiStore, type ViewMode } from '@/store/ui-store'
import { LayoutDashboard, FileText, CheckSquare, Columns3 } from 'lucide-react'

const views: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { id: 'editor', label: 'Editor', icon: <FileText className="size-4" /> },
  { id: 'checklist', label: 'Checklist', icon: <CheckSquare className="size-4" /> },
  { id: 'kanban', label: 'Kanban', icon: <Columns3 className="size-4" /> },
]

export function ViewSwitcher() {
  const { activeView, setActiveView } = useUiStore()

  return (
    <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
      {views.map((view) => {
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
