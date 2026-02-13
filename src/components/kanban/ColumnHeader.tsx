import type { Column } from '@/lib/markdown/types'

interface ColumnHeaderProps {
  column: Column
}

export function ColumnHeader({ column }: ColumnHeaderProps) {
  const completed = column.tasks.filter((t) => t.checked).length
  const total = column.tasks.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="px-3.5 py-3 border-b border-border/60">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-foreground italic">
          {column.title}
        </h3>
        <span className="text-xs tabular-nums font-medium text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
          {total}
        </span>
      </div>
      {total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {percent}%
          </span>
        </div>
      )}
    </div>
  )
}
