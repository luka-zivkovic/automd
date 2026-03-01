import { useMemo } from 'react'
import { useDashboardData, type DashboardTask, type BoardSummary } from '@/hooks/useDashboardData'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { getProjectColorClass } from '@/lib/utils/project-colors'
import { formatDueDate } from '@/lib/utils/metadata-colors'
import { formatRelativeDate } from '@/lib/format-relative-date'
import type { Project } from '@/lib/markdown/types'
import {
  Home,
  Columns3,
  CheckSquare,
  FileText,
  Layers,
  Clock,
  AlertCircle,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

interface ProjectCard {
  project: Project
  boardCount: number
  checklistCount: number
  noteCount: number
  totalTasks: number
  completedTasks: number
  completionPercent: number
  overdueCount: number
  lastUpdated: number
}

// ── Stat Card ────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, variant = 'default' }: {
  label: string
  value: string | number
  icon: LucideIcon
  variant?: 'default' | 'danger'
}) {
  return (
    <Card className="py-4 gap-3">
      <CardContent className="px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            {label}
          </span>
          <Icon className={`size-3.5 ${
            variant === 'danger' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground/50'
          }`} />
        </div>
        <p className={`text-2xl font-light tabular-nums ${
          variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-gradient'
        }`}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

// ── Project Card ─────────────────────────────────────────────────────

function ProjectCardComponent({ card }: { card: ProjectCard }) {
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setActiveProjectId = useUiStore((s) => s.setActiveProjectId)

  function handleClick() {
    setActiveView('project-home')
    setActiveProjectId(card.project.id)
  }

  const itemTotal = card.boardCount + card.checklistCount + card.noteCount

  return (
    <button onClick={handleClick} className="text-left group">
      <Card className="py-0 gap-0 card-hover transition-all h-full">
        <div className="p-4 pb-3">
          <div className="flex items-center gap-2.5 mb-2">
            <div className={`size-3 rounded-full shrink-0 ${getProjectColorClass(card.project.color)}`} />
            <p className="text-sm font-medium text-foreground truncate">{card.project.name}</p>
          </div>

          {/* Item type breakdown */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {card.boardCount > 0 && (
              <span className="flex items-center gap-1">
                <Columns3 className="size-3" />
                {card.boardCount}
              </span>
            )}
            {card.checklistCount > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="size-3" />
                {card.checklistCount}
              </span>
            )}
            {card.noteCount > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="size-3" />
                {card.noteCount}
              </span>
            )}
            {itemTotal === 0 && (
              <span className="text-muted-foreground/60">No items yet</span>
            )}
          </div>
        </div>

        <Separator />

        <div className="p-4 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {card.totalTasks > 0 ? (
              <>
                <Progress value={card.completionPercent} className="w-20 h-1" />
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {card.completedTasks}/{card.totalTasks}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-muted-foreground/60">
                {itemTotal} item{itemTotal !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {card.overdueCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-red-600 dark:text-red-400 border-red-500/20">
                <AlertCircle className="size-2.5" />
                {card.overdueCount}
              </Badge>
            )}
            {card.lastUpdated > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {formatRelativeDate(card.lastUpdated)}
              </span>
            )}
            <ChevronRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>
      </Card>
    </button>
  )
}

// ── Recent Item Row ──────────────────────────────────────────────────

function RecentItemRow({ board }: { board: BoardSummary }) {
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const files = useFilesStore((s) => s.files)

  function handleClick() {
    setActiveFile(board.fileId)
    const file = files.find((f) => f.id === board.fileId)
    const defaultView = file?.itemType === 'note' ? 'editor' : file?.itemType === 'checklist' ? 'checklist' : 'kanban'
    setActiveView(defaultView)
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors group"
    >
      <FileText className="size-3.5 text-muted-foreground/40 shrink-0" />
      <span className="text-sm text-foreground truncate flex-1">{board.fileName}</span>
      {board.projectName && (
        <div className="flex items-center gap-1.5 shrink-0">
          {board.projectColor && (
            <div className={`size-2 rounded-full shrink-0 ${getProjectColorClass(board.projectColor)}`} />
          )}
          <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
            {board.projectName}
          </span>
        </div>
      )}
      <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
        {formatRelativeDate(board.lastUpdated)}
      </span>
      <ChevronRight className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
    </button>
  )
}

// ── Overdue Task Row ─────────────────────────────────────────────────

function OverdueTaskRow({ dt }: { dt: DashboardTask }) {
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  function handleClick() {
    setActiveFile(dt.fileId)
    setActiveView('checklist')
    setTimeout(() => setSelectedTaskId(dt.task.id), 50)
  }

  return (
    <button
      onClick={handleClick}
      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors group"
    >
      {dt.task.metadata.priority ? (
        <span className={`size-2 rounded-full shrink-0 ${
          dt.task.metadata.priority === 'high' ? 'bg-red-500' :
          dt.task.metadata.priority === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
        }`} />
      ) : (
        <span className="size-2 rounded-full shrink-0 bg-border" />
      )}
      <span className="text-sm text-foreground truncate flex-1">
        {dt.task.displayContent}
      </span>
      {dt.task.metadata.dueDate && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-red-600 dark:text-red-400 border-red-500/20 shrink-0">
          {formatDueDate(dt.task.metadata.dueDate)}
        </Badge>
      )}
      <span className="text-[11px] text-muted-foreground shrink-0 truncate max-w-[120px]">
        {dt.fileName}
      </span>
      <ChevronRight className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
    </button>
  )
}

// ── Section Header ───────────────────────────────────────────────────

function SectionHeader({ title, count, variant = 'default' }: {
  title: string
  count?: number
  variant?: 'default' | 'danger'
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <h3 className={`font-display text-lg italic ${
        variant === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
      }`}>
        {title}
      </h3>
      {count !== undefined && count > 0 && (
        <Badge
          variant={variant === 'danger' ? 'outline' : 'secondary'}
          className={`text-[10px] tabular-nums px-1.5 h-5 ${
            variant === 'danger' ? 'text-red-600 dark:text-red-400 border-red-500/20' : ''
          }`}
        >
          {count}
        </Badge>
      )}
    </div>
  )
}

// ── Empty State ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
            <Home className="size-7 text-muted-foreground" />
          </div>
          <h3 className="font-display text-2xl text-foreground italic">Welcome to automd</h3>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Create your first project or board to get started. Open the sidebar and click
            the{' '}
            <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">+</code>{' '}
            button to begin.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────────────

export function HomeView() {
  const data = useDashboardData()
  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)

  // Build project cards with aggregated stats
  const projectCards = useMemo<ProjectCard[]>(() => {
    return projects.map((project) => {
      const projectFiles = files.filter((f) => f.projectId === project.id)
      const projectBoards = data.boards.filter((b) => b.projectId === project.id)

      let boardCount = 0
      let checklistCount = 0
      let noteCount = 0
      for (const f of projectFiles) {
        if (f.itemType === 'board') boardCount++
        else if (f.itemType === 'checklist') checklistCount++
        else if (f.itemType === 'note') noteCount++
      }

      let totalTasks = 0
      let completedTasks = 0
      let overdueCount = 0
      let lastUpdated = 0
      for (const b of projectBoards) {
        totalTasks += b.taskCount
        completedTasks += b.completedCount
        overdueCount += b.overdueCount
        if (b.lastUpdated > lastUpdated) lastUpdated = b.lastUpdated
      }

      const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      return {
        project,
        boardCount,
        checklistCount,
        noteCount,
        totalTasks,
        completedTasks,
        completionPercent,
        overdueCount,
        lastUpdated,
      }
    })
  }, [projects, files, data.boards])

  // Recent items: top 8 boards sorted by last updated
  const recentItems = useMemo(() => {
    return [...data.boards]
      .sort((a, b) => b.lastUpdated - a.lastUpdated)
      .slice(0, 8)
  }, [data.boards])

  // Ungrouped files (not in any project)
  const ungroupedFiles = useMemo(() => {
    return files.filter((f) => !f.projectId)
  }, [files])

  const hasUngroupedFiles = ungroupedFiles.length > 0

  // Show empty state when there are no projects AND no boards
  if (projects.length === 0 && data.totalBoards === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Hero */}
          <div className="mb-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-display text-3xl text-foreground italic">Home</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {data.completedTasks} of {data.totalTasks} tasks complete across {data.totalBoards} item{data.totalBoards !== 1 ? 's' : ''}
                </p>
              </div>
              {data.totalTasks > 0 && (
                <span className="text-3xl font-light tabular-nums text-gradient">
                  {data.completionPercent}%
                </span>
              )}
            </div>
            {data.totalTasks > 0 && (
              <Progress value={data.completionPercent} className="h-2" />
            )}
          </div>

          {/* Global Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 stagger-enter">
            <StatCard label="Projects" value={data.totalProjects} icon={Layers} />
            <StatCard label="Tasks" value={data.totalTasks} icon={CheckSquare} />
            <StatCard label="Done" value={data.completedTasks} icon={FileText} />
            <StatCard
              label="Overdue"
              value={data.overdueCount}
              icon={Clock}
              variant={data.overdueCount > 0 ? 'danger' : 'default'}
            />
          </div>

          {/* Projects */}
          {projectCards.length > 0 && (
            <div className="mb-8">
              <SectionHeader title="Projects" count={projectCards.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-enter">
                {projectCards.map((card) => (
                  <ProjectCardComponent key={card.project.id} card={card} />
                ))}
              </div>
            </div>
          )}

          {/* Ungrouped Items */}
          {hasUngroupedFiles && (
            <div className="mb-8">
              <SectionHeader title="Ungrouped Items" count={ungroupedFiles.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-enter">
                {data.boards
                  .filter((b) => !b.projectId)
                  .map((board) => (
                    <UngroupedBoardCard key={board.fileId} board={board} />
                  ))}
              </div>
            </div>
          )}

          {/* Recent Items */}
          {recentItems.length > 0 && (
            <div className="mb-8">
              <SectionHeader title="Recently Updated" count={recentItems.length} />
              <Card className="py-1 gap-0 overflow-hidden">
                <CardContent className="px-1">
                  <div className="divide-y divide-border/40">
                    {recentItems.map((board) => (
                      <RecentItemRow key={board.fileId} board={board} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Overdue Tasks */}
          {data.overdueTasks.length > 0 && (
            <div className="mb-8">
              <SectionHeader title="Overdue" count={data.overdueTasks.length} variant="danger" />
              <Card className="py-1 gap-0 overflow-hidden border-red-500/10">
                <CardContent className="px-1">
                  <div className="divide-y divide-border/40">
                    {data.overdueTasks.slice(0, 10).map((dt) => (
                      <OverdueTaskRow key={`${dt.fileId}-${dt.task.id}`} dt={dt} />
                    ))}
                  </div>
                  {data.overdueTasks.length > 10 && (
                    <div className="px-3 py-2 border-t border-border/40">
                      <p className="text-xs text-muted-foreground">
                        +{data.overdueTasks.length - 10} more overdue
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Ungrouped Board Card ─────────────────────────────────────────────

function UngroupedBoardCard({ board }: { board: BoardSummary }) {
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const files = useFilesStore((s) => s.files)

  function handleClick() {
    setActiveFile(board.fileId)
    const file = files.find((f) => f.id === board.fileId)
    const defaultView = file?.itemType === 'note' ? 'editor' : file?.itemType === 'checklist' ? 'checklist' : 'kanban'
    setActiveView(defaultView)
  }

  return (
    <button onClick={handleClick} className="text-left group">
      <Card className="py-0 gap-0 card-hover transition-all h-full">
        <div className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="size-3.5 text-muted-foreground/40 shrink-0" />
            <p className="text-sm font-medium text-foreground truncate">{board.fileName}</p>
          </div>
        </div>
        <Separator />
        <div className="p-4 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {board.hideCompletion ? (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {board.taskCount} {board.itemLabel.toLowerCase()}{board.taskCount !== 1 ? 's' : ''}
              </span>
            ) : (
              <>
                <Progress value={board.completionPercent} className="w-20 h-1" />
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {board.completedCount}/{board.taskCount}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {board.overdueCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-red-600 dark:text-red-400 border-red-500/20">
                <AlertCircle className="size-2.5" />
                {board.overdueCount}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {formatRelativeDate(board.lastUpdated)}
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
        </div>
      </Card>
    </button>
  )
}
