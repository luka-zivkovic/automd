import { useState, useRef } from 'react'
import { useKnownLabels } from '@/lib/selectors'
import { getLabelColor } from '@/lib/utils/metadata-colors'
import { X } from 'lucide-react'

interface LabelPickerProps {
  value: string[]
  onChange: (v: string[]) => void
}

export function LabelPicker({ value, onChange }: LabelPickerProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const knownLabels = useKnownLabels()

  const suggestions = knownLabels.filter(
    (l) =>
      !value.includes(l) &&
      l.toLowerCase().includes(input.toLowerCase())
  )

  function addLabel(name: string) {
    const trimmed = name.trim().replace(/\s+/g, '-')
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
    inputRef.current?.focus()
  }

  function removeLabel(name: string) {
    onChange(value.filter((l) => l !== name))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (input.trim()) {
        addLabel(input)
      }
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeLabel(value[value.length - 1])
    }
  }

  return (
    <div className="space-y-2 p-2">
      {/* Selected labels as colored chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((label) => {
            const colors = getLabelColor(label)
            return (
              <span
                key={label}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} ${colors.border}`}
              >
                #{label}
                <button
                  type="button"
                  onClick={() => removeLabel(label)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a label..."
        autoFocus
        className="w-full text-xs bg-transparent border-b border-border px-1 py-1 outline-none focus:border-primary placeholder:text-muted-foreground/50"
      />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((label) => {
            const colors = getLabelColor(label)
            return (
              <button
                key={label}
                type="button"
                onClick={() => addLabel(label)}
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium hover:opacity-80 transition-opacity ${colors.bg} ${colors.text} ${colors.border}`}
              >
                #{label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
