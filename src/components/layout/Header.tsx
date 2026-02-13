import { ViewSwitcher } from './ViewSwitcher'
import { useDocumentStore } from '@/store/document-store'
import { useFileImport } from '@/hooks/useFileImport'
import { useFileExport } from '@/hooks/useFileExport'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Upload, Download, FileText } from 'lucide-react'
import { UserBadge } from '@/components/settings/UserBadge'

export function Header() {
  const tasks = useDocumentStore((s) => s.tasks)
  const { importFile } = useFileImport()
  const { exportFile } = useFileExport()

  const completedCount = tasks.filter((t) => t.checked).length
  const totalCount = tasks.length
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <header className="shrink-0 relative z-10">
      <div className="flex items-center justify-between px-5 py-3 bg-background/80 backdrop-blur-md">
        {/* Logo + progress */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="size-3.5 text-primary" />
            </div>
            <h1 className="font-display text-[22px] tracking-tight text-foreground italic">
              automd
            </h1>
          </div>

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
          <UserBadge />
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
