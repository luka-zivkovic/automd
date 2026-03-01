import { useUiStore, type ViewMode } from '@/store/ui-store'
import { useFilesStore } from '@/store/files-store'
import { Home, Brain } from 'lucide-react'

const NAV_ITEMS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <Home className="size-4" /> },
  { id: 'memory', label: 'Memory', icon: <Brain className="size-4" /> },
]

export function SidebarNav() {
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)

  function handleClick(viewId: ViewMode) {
    setActiveView(viewId)
    if (viewId === 'home') {
      setActiveProjectId(null)
    }
  }

  return (
    <div className="px-2 py-1.5 flex flex-col gap-0.5">
      {NAV_ITEMS.map((item) => {
        const isActive = activeView === item.id
        return (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            className={`
              flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors duration-150 w-full text-left
              ${isActive
                ? 'bg-primary/10 text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }
            `}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
