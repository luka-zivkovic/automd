import { X } from 'lucide-react'

interface EstimateInputProps {
  value: number | null
  onChange: (v: number | null) => void
}

export function EstimateInput({ value, onChange }: EstimateInputProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    if (raw === '') {
      onChange(null)
      return
    }
    const num = parseFloat(raw)
    if (!isNaN(num) && num > 0) {
      onChange(num)
    } else if (num === 0) {
      onChange(null)
    }
  }

  return (
    <div className="flex items-center gap-2 p-2">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          step="0.5"
          value={value ?? ''}
          onChange={handleChange}
          placeholder="0"
          autoFocus
          className="w-16 text-xs bg-background border border-input rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring text-foreground tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-xs text-muted-foreground font-medium">hours</span>
      </div>
      {value !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground transition-colors"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
