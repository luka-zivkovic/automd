import { useActivityStore, type ActivityEvent } from '@/store/activity-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Activity,
  X,
  Plus,
  Edit3,
  Trash2,
  FolderPlus,
  Folder,
  FolderMinus,
  Zap,
  type LucideIcon,
} from 'lucide-react'

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const eventIcons: Record<string, LucideIcon> = {
  'file:created': Plus,
  'file:updated': Edit3,
  'file:deleted': Trash2,
  'project:created': FolderPlus,
  'project:updated': Folder,
  'project:deleted': FolderMinus,
  'workflow:launched': Zap,
}

const eventColors: Record<string, string> = {
  'file:created': 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  'file:updated': 'text-primary bg-primary/10',
  'file:deleted': 'text-destructive bg-destructive/10',
  'project:created': 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40',
  'project:updated': 'text-primary bg-primary/10',
  'project:deleted': 'text-destructive bg-destructive/10',
  'workflow:launched': 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40',
}

function ActivityItem({ event }: { event: ActivityEvent }) {
  const Icon = eventIcons[event.type] || Activity
  const colorClass = eventColors[event.type] || 'text-muted-foreground bg-secondary'

  return (
    <div className="flex gap-3 px-5 py-3 hover:bg-accent/30 transition-colors">
      <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}>
        <Icon className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-foreground leading-snug">
          {event.description}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 font-mono tracking-tight">
          {event.actor}
          <span className="mx-1.5 opacity-40">/</span>
          {formatRelativeTime(event.timestamp)}
        </p>
      </div>
    </div>
  )
}

export function ActivityFeed() {
  const events = useActivityStore((s) => s.events)
  const isOpen = useActivityStore((s) => s.isOpen)
  const setOpen = useActivityStore((s) => s.setOpen)

  if (!isOpen) return null

  return (
    <aside className="w-[320px] shrink-0 border-l border-border bg-background/95 backdrop-blur-sm flex flex-col detail-panel-enter">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-primary" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Activity
          </span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="size-10 rounded-xl bg-secondary flex items-center justify-center mb-3">
              <Activity className="size-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Changes will appear here in real time
            </p>
          </div>
        ) : (
          <div className="py-1">
            {events.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
