import { useDashboardData, type DashboardTask, type BoardSummary } from '@/hooks/useDashboardData'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { getProjectColorClass } from '@/lib/utils/project-colors'
import { getAvatarColor, getInitials, formatDueDate } from '@/lib/utils/metadata-colors'
import { formatRelativeDate } from '@/lib/format-relative-date'
import type { ActivityEvent } from '@/store/activity-store'
import {
  LayoutDashboard,
  AlertCircle,
  FileText,
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  Edit3,
  Trash2,
  FolderPlus,
  Folder,
  FolderMinus,
  Activity,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'

// ── Activity icons/colors ─────────────────────────────────────────────

const eventIcons: Record<string, LucideIcon> = {
  'file:created': Plus,
  'file:updated': Edit3,
  'file:deleted': Trash2,
  'project:created': FolderPlus,
  'project:updated': Folder,
  'project:deleted': FolderMinus,
}

const eventColors: Record<string, string> = {
  'file:created': 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  'file:updated': 'text-primary bg-primary/10',
  'file:deleted': 'text-destructive bg-destructive/10',
  'project:created': 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  'project:updated': 'text-primary bg-primary/10',
  'project:deleted': 'text-destructive bg-destructive/10',
}

// ── Stat Card ─────────────────────────────────────────────────────────

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

// ── Board Card ────────────────────────────────────────────────────────

function BoardCard({ board }: { board: BoardSummary }) {
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)

  function handleClick() {
    setActiveFile(board.fileId)
    setActiveView('checklist')
  }

  return (
    <button onClick={handleClick} className="text-left group">
      <Card className="py-0 gap-0 card-hover transition-all h-full">
        <div className="p-4 pb-3">
          {board.projectName && (
            <div className="flex items-center gap-1.5 mb-1.5">
              {board.projectColor && (
                <div className={`size-2 rounded-full shrink-0 ${getProjectColorClass(board.projectColor)}`} />
              )}
              <span className="text-[11px] text-muted-foreground truncate">
                {board.projectName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <FileText className="size-3.5 text-muted-foreground/40 shrink-0" />
            <p className="text-sm font-medium text-foreground truncate">{board.fileName}</p>
          </div>
        </div>
        <Separator />
        <div className="p-4 pt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Progress value={board.completionPercent} className="w-20 h-1" />
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {board.completedCount}/{board.taskCount}
            </span>
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

// ── Task Row ──────────────────────────────────────────────────────────

function DashboardTaskRow({ dt, showDueDate = false }: {
  dt: DashboardTask
  showDueDate?: boolean
}) {
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
      {showDueDate && dt.task.metadata.dueDate && (
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

// ── Activity Row ──────────────────────────────────────────────────────

function ActivityRow({ event }: { event: ActivityEvent }) {
  const Icon = eventIcons[event.type] || Activity
  const colorClass = eventColors[event.type] || 'text-muted-foreground bg-secondary'

  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className={`size-6 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}>
        <Icon className="size-3" />
      </div>
      <span className="text-sm text-foreground truncate flex-1">{event.description}</span>
      <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
        {formatRelativeDate(event.timestamp)}
      </span>
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────

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

// ── Main View ─────────────────────────────────────────────────────────

export function DashboardView() {
  const data = useDashboardData()

  if (data.totalBoards === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <LayoutDashboard className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">Welcome to automd</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Create your first board to see your dashboard overview. Open the sidebar and click
              the{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">+</code>{' '}
              button to get started.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Hero — mirrors ChecklistView progress header */}
          <div className="mb-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-display text-3xl text-foreground italic">Dashboard</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {data.completedTasks} of {data.totalTasks} tasks complete across {data.totalBoards} board{data.totalBoards !== 1 ? 's' : ''}
                </p>
              </div>
              <span className="text-3xl font-light tabular-nums text-gradient">
                {data.completionPercent}%
              </span>
            </div>
            <Progress value={data.completionPercent} className="h-2" />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 stagger-enter">
            <StatCard label="Boards" value={data.totalBoards} icon={Layers} />
            <StatCard label="Tasks" value={data.totalTasks} icon={FileText} />
            <StatCard label="Done" value={data.completedTasks} icon={CheckCircle2} />
            <StatCard
              label="Overdue"
              value={data.overdueCount}
              icon={Clock}
              variant={data.overdueCount > 0 ? 'danger' : 'default'}
            />
          </div>

          {/* Boards */}
          <div className="mb-8">
            <SectionHeader title="Boards" count={data.totalBoards} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-enter">
              {data.boards.map((board) => (
                <BoardCard key={board.fileId} board={board} />
              ))}
            </div>
          </div>

          {/* My Tasks */}
          {data.myTasks.length > 0 && (
            <div className="mb-8">
              <SectionHeader title="My Tasks" count={data.myTasks.length} />
              <Card className="py-1 gap-0 overflow-hidden">
                <CardContent className="px-1">
                  <div className="divide-y divide-border/40">
                    {data.myTasks.slice(0, 10).map((dt) => (
                      <DashboardTaskRow key={`${dt.fileId}-${dt.task.id}`} dt={dt} />
                    ))}
                  </div>
                  {data.myTasks.length > 10 && (
                    <div className="px-3 py-2 border-t border-border/40">
                      <p className="text-xs text-muted-foreground">
                        +{data.myTasks.length - 10} more tasks
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Overdue */}
          {data.overdueTasks.length > 0 && (
            <div className="mb-8">
              <SectionHeader title="Overdue" count={data.overdueTasks.length} variant="danger" />
              <Card className="py-1 gap-0 overflow-hidden border-red-500/10">
                <CardContent className="px-1">
                  <div className="divide-y divide-border/40">
                    {data.overdueTasks.slice(0, 10).map((dt) => (
                      <DashboardTaskRow key={`${dt.fileId}-${dt.task.id}`} dt={dt} showDueDate />
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

          {/* Built By & Activity — side by side */}
          {(data.builtByStats.length > 0 || data.recentEvents.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">

              {data.builtByStats.length > 0 && (
                <Card className="py-4 gap-3">
                  <CardHeader className="px-4 py-0">
                    <CardTitle className="font-display text-base italic font-normal">Built By</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <div className="space-y-3">
                      {data.builtByStats.slice(0, 5).map((entry) => (
                        <div key={entry.user} className="flex items-center gap-3">
                          <span className={`inline-flex items-center justify-center size-7 rounded-full text-[11px] font-bold text-white ${getAvatarColor(entry.user)}`}>
                            {getInitials(entry.user)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{entry.user}</p>
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                              {entry.count} task{entry.count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {data.recentEvents.length > 0 && (
                <Card className="py-4 gap-3">
                  <CardHeader className="px-4 py-0">
                    <CardTitle className="font-display text-base italic font-normal">Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4">
                    <div className="space-y-0.5">
                      {data.recentEvents.slice(0, 5).map((event) => (
                        <ActivityRow key={event.id} event={event} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  )
}
