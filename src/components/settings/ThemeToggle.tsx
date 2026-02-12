import { useThemeStore } from '@/store/theme-store'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Sun, Moon, Monitor } from 'lucide-react'

const THEMES = ['light', 'dark', 'system'] as const
const ICONS = { light: Sun, dark: Moon, system: Monitor }
const LABELS = { light: 'Light', dark: 'Dark', system: 'System' }

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const Icon = ICONS[theme]

  function cycle() {
    const idx = THEMES.indexOf(theme)
    const next = THEMES[(idx + 1) % THEMES.length]
    setTheme(next)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={cycle}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{LABELS[theme]} theme</TooltipContent>
    </Tooltip>
  )
}
