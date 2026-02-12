import { useConnectionStore, type ConnectionStatus as Status } from '@/store/connection-store'
import { Wifi, WifiOff, Loader2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const statusConfig: Record<Status, {
  icon: typeof Wifi
  label: string
  badgeClass: string
  iconClass: string
  dotClass?: string
}> = {
  connected: {
    icon: Wifi,
    label: 'Connected',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
    iconClass: '',
    dotClass: 'bg-emerald-500',
  },
  disconnected: {
    icon: WifiOff,
    label: 'Disconnected',
    badgeClass: 'border-destructive/30 bg-destructive/5 text-destructive dark:border-destructive/40 dark:bg-destructive/10',
    iconClass: '',
  },
  reconnecting: {
    icon: Loader2,
    label: 'Reconnecting',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
    iconClass: 'animate-spin',
  },
}

export function ConnectionStatus() {
  const status = useConnectionStore((s) => s.status)
  const agents = useConnectionStore((s) => s.agents)
  const config = statusConfig[status]
  const Icon = config.icon

  if (!import.meta.env.VITE_AUTOMD_SERVER) return null

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn('gap-1.5 py-0.5 pl-1.5 pr-2 text-[11px] font-medium cursor-default select-none', config.badgeClass)}
          >
            {config.dotClass ? (
              <span className={cn('inline-flex size-1.5 rounded-full shrink-0', config.dotClass)} />
            ) : (
              <Icon className={cn('size-3', config.iconClass)} />
            )}
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {status === 'connected' && 'Connected to server'}
          {status === 'disconnected' && 'Disconnected from server'}
          {status === 'reconnecting' && 'Attempting to reconnect...'}
        </TooltipContent>
      </Tooltip>

      {status === 'connected' && agents.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="gap-1 py-0.5 px-1.5 text-[11px] font-medium cursor-default select-none text-muted-foreground"
            >
              <Users className="size-3" />
              {agents.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-[11px] opacity-70 mb-0.5">
                {agents.length} connected
              </span>
              {agents.map((agent, i) => (
                <span key={i} className="text-xs">
                  {agent.username}
                </span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
