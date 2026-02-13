interface PriorityPickerProps {
  value: 'high' | 'medium' | 'low' | null
  onChange: (v: 'high' | 'medium' | 'low' | null) => void
}

const PRIORITIES: { key: 'high' | 'medium' | 'low'; color: string; activeRing: string; label: string }[] = [
  { key: 'high', color: 'bg-red-500', activeRing: 'ring-red-500/40', label: 'High' },
  { key: 'medium', color: 'bg-amber-500', activeRing: 'ring-amber-500/40', label: 'Medium' },
  { key: 'low', color: 'bg-emerald-500', activeRing: 'ring-emerald-500/40', label: 'Low' },
]

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div className="flex items-center gap-3 p-2">
      {PRIORITIES.map(({ key, color, activeRing, label }) => {
        const isActive = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(isActive ? null : key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              isActive
                ? `ring-2 ${activeRing} scale-105 bg-secondary text-foreground`
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <span
              className={`size-2.5 rounded-full ${color} ${
                isActive ? 'scale-110' : ''
              } transition-transform`}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
