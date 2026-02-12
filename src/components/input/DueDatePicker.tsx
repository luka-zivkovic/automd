import { formatDueDate } from '@/lib/utils/metadata-colors'
import { X } from 'lucide-react'

interface DueDatePickerProps {
  value: string | null
  onChange: (v: string | null) => void
}

export function DueDatePicker({ value, onChange }: DueDatePickerProps) {
  return (
    <div className="flex items-center gap-2 p-2">
      <input
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="text-xs bg-background border border-input rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring text-foreground"
      />
      {value && (
        <>
          <span className="text-xs text-muted-foreground">
            {formatDueDate(value)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </div>
  )
}
