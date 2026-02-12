import { X } from 'lucide-react'

interface FilterChipProps {
  label: string
  onRemove: () => void
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 dark:bg-primary/25 text-primary dark:text-orange-300 px-2 py-0.5 text-xs font-medium">
      {label}
      <button
        onClick={onRemove}
        className="inline-flex items-center justify-center rounded-full hover:bg-primary/25 dark:hover:bg-primary/35 size-3.5 transition-colors"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-2.5" />
      </button>
    </span>
  )
}
