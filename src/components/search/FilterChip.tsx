import { X } from 'lucide-react'

interface FilterChipProps {
  label: string
  onRemove: () => void
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-xs font-medium">
      {label}
      <button
        onClick={onRemove}
        className="inline-flex items-center justify-center rounded-full hover:bg-amber-200 dark:hover:bg-amber-800/40 size-3.5 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-2.5" />
      </button>
    </span>
  )
}
