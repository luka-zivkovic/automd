import { ViewSwitcher } from './ViewSwitcher'
import { ConnectionStatus } from './ConnectionStatus'
import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { useFileImport } from '@/hooks/useFileImport'
import { useFileExport } from '@/hooks/useFileExport'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Upload, Download, Undo2, Redo2, PanelLeftOpen, PanelLeftClose, ChevronRight, ChevronLeft, Activity, LogOut, BookOpen, Archive, Inbox } from 'lucide-react'
import { apiFetch, HAS_SERVER } from '@/lib/api'
import type { BoardFile } from '@/lib/markdown/types'
import { useActivityStore } from '@/store/activity-store'
import { useAuthStore } from '@/store/auth-store'
import { UserBadge } from '@/components/settings/UserBadge'
import { ThemeToggle } from '@/components/settings/ThemeToggle'
import { ApiKeyManager } from '@/components/settings/ApiKeyManager'
import { getProjectColorClass } from '@/lib/utils/project-colors'

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

  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const activeFile = files.find((f) => f.id === activeFileId)
  const activeProject = activeFile?.projectId
    ? projects.find((p) => p.id === activeFile.projectId)
    : null

  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const addOrUpdateFile = useFilesStore((s) => s.addOrUpdateFile)

  // Detect if active file is an archive/backlog board
  const parentBoard = activeFile
    ? files.find((f) => f.archiveBoardId === activeFileId || f.backlogBoardId === activeFileId)
    : null
  const isArchiveView = parentBoard ? parentBoard.archiveBoardId === activeFileId : false
  const isBacklogView = parentBoard ? parentBoard.backlogBoardId === activeFileId : false

  async function navigateToLinkedBoard(type: 'archive' | 'backlog') {
    if (!HAS_SERVER || !activeFile) return
    const result = await apiFetch<BoardFile>(`/files/${activeFile.id}/${type}`, { method: 'POST' })
    if (!result.ok) return
    const board = result.data
    const fullResult = await apiFetch<{ markdown?: string; archiveBoardId?: string | null; backlogBoardId?: string | null }>(`/files/${board.id}`)
    if (!fullResult.ok) return
    const fullBoard: BoardFile = {
      ...board,
      markdown: fullResult.data?.markdown ?? '',
      archiveBoardId: fullResult.data?.archiveBoardId ?? null,
      backlogBoardId: fullResult.data?.backlogBoardId ?? null,
    }
    addOrUpdateFile(fullBoard)
    addOrUpdateFile({ ...activeFile, [`${type}BoardId`]: board.id } as BoardFile)
    setActiveFile(board.id)
  }

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

          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="automd" className="size-7 rounded-lg" />
            <h1 className="font-display text-[22px] tracking-tight text-foreground italic">
              automd
            </h1>
          </div>

          {/* Active file name with project breadcrumb */}
          {activeFile && (
            <>
              <div className="w-px h-4 bg-border" />
              {parentBoard ? (
                /* Back-to-parent breadcrumb for archive/backlog views */
                <div className="flex items-center gap-1.5 min-w-0 max-w-[360px]">
                  <button
                    className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors truncate"
                    onClick={() => setActiveFile(parentBoard.id)}
                  >
                    <ChevronLeft className="size-3 shrink-0" />
                    {parentBoard.name}
                  </button>
                  <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate flex items-center gap-1">
                    {isArchiveView && <Archive className="size-3 shrink-0" />}
                    {isBacklogView && <Inbox className="size-3 shrink-0" />}
                    {isArchiveView ? 'Archive' : 'Backlog'}
                  </span>
                </div>
              ) : (
                /* Normal breadcrumb with archive/backlog pills */
                <div className="flex items-center gap-1.5 min-w-0 max-w-[400px]">
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
                  {HAS_SERVER && (
                    <div className="flex items-center gap-1 ml-1.5 shrink-0">
                      {activeFile.archiveBoardId && (
                        <button
                          className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground transition-colors"
                          onClick={() => navigateToLinkedBoard('archive')}
                        >
                          <Archive className="size-3" />
                          Archive
                        </button>
                      )}
                      <button
                        className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground transition-colors"
                        onClick={() => navigateToLinkedBoard('backlog')}
                      >
                        <Inbox className="size-3" />
                        Backlog
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {totalCount > 0 && (
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

        <ViewSwitcher />

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
                variant="ghost"
                size="icon-sm"
                onClick={() => useUiStore.getState().setPromptsLibraryOpen(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <BookOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Prompts</TooltipContent>
          </Tooltip>

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
