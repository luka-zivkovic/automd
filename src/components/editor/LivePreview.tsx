import { useDocumentStore } from '@/store/document-store'
import { CheckCircle2, Circle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { Task, Column } from '@/lib/markdown/types'

function PreviewTask({ task, depth = 0 }: { task: Task; depth?: number }) {
  return (
    <div>
      <div
        className="flex items-start gap-2 py-0.5"
        style={{ paddingLeft: `${depth * 20}px` }}
      >
        {task.checked ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        ) : (
          <Circle className="w-3.5 h-3.5 text-border mt-0.5 shrink-0" />
        )}
        <span
          className={`text-[13px] leading-relaxed ${
            task.checked
              ? 'line-through text-muted-foreground/50'
              : 'text-foreground'
          }`}
        >
          {task.displayContent}
        </span>
      </div>
      {task.children.map((child) => (
        <PreviewTask key={child.id} task={child} depth={depth + 1} />
      ))}
    </div>
  )
}

function PreviewColumn({ column }: { column: Column }) {
  const completed = column.tasks.filter((t) => t.checked).length
  const total = column.tasks.length

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-base text-foreground italic">
          {column.title}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {completed}/{total}
        </span>
      </div>
      <Progress
        value={total > 0 ? (completed / total) * 100 : 0}
        className="h-1 mb-3"
      />
      <div className="space-y-0.5">
        {column.tasks.map((task) => (
          <PreviewTask key={task.id} task={task} />
        ))}
      </div>
    </div>
  )
}

export function LivePreview() {
  const columns = useDocumentStore((s) => s.columns)

  if (columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-muted-foreground max-w-[200px]">
          <p className="text-sm">No tasks detected yet.</p>
          <p className="text-xs mt-2 leading-relaxed">
            Use <code className="bg-secondary px-1 py-0.5 rounded text-[11px] font-mono">## Heading</code> for
            columns and <code className="bg-secondary px-1 py-0.5 rounded text-[11px] font-mono">- [ ]</code> for
            tasks.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
          Preview
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
      {columns.map((col) => (
        <PreviewColumn key={col.id} column={col} />
      ))}
    </div>
  )
}
