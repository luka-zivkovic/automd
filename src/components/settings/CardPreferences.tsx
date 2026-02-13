import { usePreferencesStore, type CardDisplayPreferences } from '@/store/preferences-store'
import { Settings2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

const PREF_LABELS: { key: keyof CardDisplayPreferences; label: string }[] = [
  { key: 'showLabels', label: 'Labels' },
  { key: 'showAssignees', label: 'Assignees' },
  { key: 'showDueDate', label: 'Due dates' },
  { key: 'showPriority', label: 'Priority' },
  { key: 'showEstimate', label: 'Estimates' },
  { key: 'showSubtaskProgress', label: 'Subtask progress' },
  { key: 'showSignatures', label: 'Signatures' },
]

export function CardPreferences() {
  const cardDisplay = usePreferencesStore((s) => s.cardDisplay)
  const setCardDisplay = usePreferencesStore((s) => s.setCardDisplay)
  const resetCardDisplay = usePreferencesStore((s) => s.resetCardDisplay)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/40"
      >
        <Settings2 className="size-3.5" />
        <span>Display</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg p-2 z-50">
          <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
            Show on cards
          </div>
          {PREF_LABELS.map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={cardDisplay[key]}
                onChange={(e) => setCardDisplay({ [key]: e.target.checked })}
                className="rounded border-input"
              />
              {label}
            </label>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={resetCardDisplay}
              className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-accent/40"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
