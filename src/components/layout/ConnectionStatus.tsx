import { useConnectionStore, type ConnectionStatus as Status } from '@/store/connection-store'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const statusConfig: Record<Status, { icon: typeof Wifi; label: string; className: string }> = {
  connected: { icon: Wifi, label: 'Connected to server', className: 'text-green-500' },
  disconnected: { icon: WifiOff, label: 'Disconnected from server', className: 'text-destructive' },
  reconnecting: { icon: Loader2, label: 'Reconnecting...', className: 'text-yellow-500 animate-spin' },
}

export function ConnectionStatus() {
  const status = useConnectionStore((s) => s.status)
  const config = statusConfig[status]
  const Icon = config.icon

  // Only show in server mode
  if (!import.meta.env.VITE_AUTOMD_SERVER) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1 px-1.5 py-1 ${config.className}`}>
          <Icon className="size-3.5" />
        </div>
      </TooltipTrigger>
      <TooltipContent>{config.label}</TooltipContent>
    </Tooltip>
  )
}
