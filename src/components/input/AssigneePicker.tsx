import { useState, useRef } from 'react'
import { useKnownAssignees } from '@/lib/selectors'
import { getAvatarColor, getInitials } from '@/lib/utils/metadata-colors'
import { X } from 'lucide-react'

interface AssigneePickerProps {
  value: string[]
  onChange: (v: string[]) => void
}

export function AssigneePicker({ value, onChange }: AssigneePickerProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const knownAssignees = useKnownAssignees()

  const suggestions = knownAssignees.filter(
    (a) =>
      !value.includes(a) &&
      a.toLowerCase().includes(input.toLowerCase())
  )

  function addAssignee(name: string) {
    const trimmed = name.trim().replace(/\s+/g, '-')
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setInput('')
    inputRef.current?.focus()
  }

  function removeAssignee(name: string) {
    onChange(value.filter((a) => a !== name))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (input.trim()) {
        addAssignee(input)
      }
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeAssignee(value[value.length - 1])
    }
  }

  return (
    <div className="space-y-2 p-2">
      {/* Selected assignees as chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((assignee) => (
            <span
              key={assignee}
              className="inline-flex items-center gap-1 rounded-full bg-secondary pl-1 pr-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              <span
                className={`inline-flex items-center justify-center size-4 rounded-full text-[10px] font-bold text-white ${getAvatarColor(assignee)}`}
              >
                {getInitials(assignee)}
              </span>
              <span>@{assignee}</span>
              <button
                type="button"
                onClick={() => removeAssignee(assignee)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a name..."
        autoFocus
        className="w-full text-xs bg-transparent border-b border-border px-1 py-1 outline-none focus:border-primary placeholder:text-muted-foreground/50"
      />

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((assignee) => (
            <button
              key={assignee}
              type="button"
              onClick={() => addAssignee(assignee)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <span
                className={`inline-flex items-center justify-center size-3.5 rounded-full text-[9px] font-bold text-white ${getAvatarColor(assignee)}`}
              >
                {getInitials(assignee)}
              </span>
              {assignee}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
