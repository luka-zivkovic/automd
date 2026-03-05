import { ConnectionStatus } from './ConnectionStatus'
import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { useFileImport } from '@/hooks/useFileImport'
import { useFileExport } from '@/hooks/useFileExport'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Upload, Download, Undo2, Redo2, PanelLeftOpen, PanelLeftClose, ChevronRight, Activity, LogOut, CheckSquare, Columns3 } from 'lucide-react'
import { useActivityStore } from '@/store/activity-store'
import { useAuthStore } from '@/store/auth-store'
import { UserBadge } from '@/components/settings/UserBadge'
import { ThemeToggle } from '@/components/settings/ThemeToggle'
import { ApiKeyManager } from '@/components/settings/ApiKeyManager'
import { PromptsPopover } from '@/components/prompts/PromptsPopover'
import { getProjectColorClass } from '@/lib/utils/project-colors'
import { apiFetch, HAS_SERVER } from '@/lib/api'

export function Header() {
  const tasks = useDocumentStore((s) => s.tasks)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const canUndo = useDocumentStore((s) => s.canUndo)
  const canRedo = useDocumentStore((s) => s.canRedo)
  const { importFile } = useFileImport()
  const { exportFile } = useFileExport()

  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const activeView = useUiStore((s) => s.activeView)
  const setActiveView = useUiStore((s) => s.setActiveView)

  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const activeFile = files.find((f) => f.id === activeFileId)
  const activeProject = activeFile?.projectId
    ? projects.find((p) => p.id === activeFile.projectId)
    : null

  const activityOpen = useActivityStore((s) => s.isOpen)
  const setActivityOpen = useActivityStore((s) => s.setOpen)
  const unreadCount = useActivityStore((s) => s.unreadCount)
  const authStatus = useAuthStore((s) => s.status)
  const isAuthed = HAS_SERVER && authStatus === 'authenticated'

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' })
    useAuthStore.getState().clearAuth()
  }

  const completedCount = tasks.filter((t) => t.checked === true).length
  const totalCount = tasks.length
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Show board view toggle only when a non-page/non-knowledge file is selected and we're in a file view
  const hideProgress = activeFile?.itemType === 'page' || activeFile?.itemType === 'knowledge'
  const showViewToggle = activeFile && !hideProgress && activeView !== 'memory' && activeView !== 'prompts' && activeView !== 'dashboard' && activeView !== 'document'

  return (
    <header className="shrink-0 relative z-10">
      <div className="flex items-center justify-between px-5 py-3 bg-background/80 backdrop-blur-md">
        {/* Left side: sidebar toggle + logo + file name + progress */}
        <div className="flex items-center gap-5">
          {/* Sidebar toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-muted-foreground hover:text-foreground"
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarOpen ? 'Close sidebar' : 'Open sidebar'}</TooltipContent>
          </Tooltip>

          <button
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            onClick={() => setActiveView('dashboard')}
          >
            <img src="/logo.png" alt="automd" className="size-7 rounded-lg" />
            <h1 className="font-display text-[22px] tracking-tight text-foreground italic">
              automd
            </h1>
          </button>

          {/* Active file name with project breadcrumb */}
          {activeFile && (
            <>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-1.5 min-w-0 max-w-[280px]">
                {activeProject && (
                  <>
                    <div className={`size-2 rounded-full shrink-0 ${getProjectColorClass(activeProject.color)}`} />
                    <span className="text-sm font-medium text-muted-foreground truncate">
                      {activeProject.name}
                    </span>
                    <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />
                  </>
                )}
                <span className="text-sm font-medium text-muted-foreground truncate">
                  {activeFile.name}
                </span>
              </div>
            </>
          )}

          {totalCount > 0 && !hideProgress && (
            <div className="flex items-center gap-2.5">
              <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums font-medium text-muted-foreground">
                {percent}%
              </span>
            </div>
          )}
        </div>

        {/* Center: view toggle + prompts */}
        <div className="flex items-center gap-2">
          {showViewToggle && (
            <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setActiveView('checklist')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
                  ${activeView !== 'kanban'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <CheckSquare className="size-4" />
                <span className="hidden sm:inline">Checklist</span>
              </button>
              <button
                onClick={() => setActiveView('kanban')}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
                  ${activeView === 'kanban'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }
                `}
              >
                <Columns3 className="size-4" />
                <span className="hidden sm:inline">Kanban</span>
              </button>
            </div>
          )}

          <PromptsPopover />
        </div>

        <div className="flex items-center gap-1">
          <ConnectionStatus />
          <UserBadge />
          <ThemeToggle />
          {isAuthed && <ApiKeyManager />}
          {isAuthed && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activityOpen ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setActivityOpen(!activityOpen)}
                className="text-muted-foreground hover:text-foreground relative"
              >
                <Activity className="size-4" />
                {unreadCount > 0 && !activityOpen && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Activity feed</TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>

          <div className="w-px h-4 bg-border mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={importFile} className="text-muted-foreground hover:text-foreground">
                <Upload className="size-4" />
                <span className="hidden md:inline text-xs">Import</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import markdown file (Ctrl+O)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={exportFile} className="text-muted-foreground hover:text-foreground">
                <Download className="size-4" />
                <span className="hidden md:inline text-xs">Export</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export markdown file (Ctrl+S)</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {/* Accent line */}
      <div className="h-px header-accent-line" />
    </header>
  )
}
