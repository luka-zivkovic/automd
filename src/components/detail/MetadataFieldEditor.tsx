import { useState, useMemo } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { useKnownAssignees, useKnownLabels } from '@/lib/selectors'
import { useBoardVocabulary } from '@/hooks/useBoardVocabulary'
import { getLabelColor, getAvatarColor, getInitials } from '@/lib/utils/metadata-colors'
import { Button } from '@/components/ui/button'
import type { Task } from '@/lib/markdown/types'
import { X, Plus } from 'lucide-react'

interface MetadataFieldEditorProps {
  taskId: string
  task: Task
}

export function MetadataFieldEditor({ taskId, task }: MetadataFieldEditorProps) {
  const updateTaskMetadata = useDocumentStore((s) => s.updateTaskMetadata)
  const knownAssignees = useKnownAssignees()
  const knownLabels = useKnownLabels()
  const { labelGroups, getGroupForLabel } = useBoardVocabulary()

  function updateField(partial: Partial<typeof task.metadata>) {
    updateTaskMetadata(taskId, task.displayContent, partial)
  }

  // Split labels into grouped (managed by selectors) vs ungrouped (shown in chip editor)
  const { groupedValues, ungroupedLabels } = useMemo(() => {
    const grouped = new Map<string, string>() // group name -> current value
    const ungrouped: string[] = []
    for (const label of task.metadata.labels) {
      const match = getGroupForLabel(label)
      if (match) {
        grouped.set(match.group, match.value)
      } else {
        ungrouped.push(label)
      }
    }
    return { groupedValues: grouped, ungroupedLabels: ungrouped }
  }, [task.metadata.labels, getGroupForLabel])

  function handleGroupChange(groupName: string, newValue: string | null) {
    // Remove old label for this group, add new one
    const newLabels = task.metadata.labels.filter((l) => {
      const match = getGroupForLabel(l)
      return !(match && match.group === groupName)
    })
    if (newValue) {
      newLabels.push(`${groupName}-${newValue}`)
    }
    updateField({ labels: newLabels })
  }

  const hasGroups = Object.keys(labelGroups).length > 0

  return (
    <div className="space-y-4">
      {/* Label Groups (from vocabulary) */}
      {hasGroups && Object.entries(labelGroups).map(([groupName, groupDef]) => (
        <MetadataRow key={groupName} label={groupName}>
          <GroupSelector
            options={groupDef.options}
            value={groupedValues.get(groupName) ?? null}
            onChange={(val) => handleGroupChange(groupName, val)}
          />
        </MetadataRow>
      ))}

      {/* Assignees */}
      <MetadataRow label="Assignees">
        <ChipEditor
          values={task.metadata.assignees}
          suggestions={knownAssignees}
          placeholder="Add assignee..."
          onChange={(assignees) => updateField({ assignees })}
          renderChip={(name) => (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary pl-0.5 pr-2 py-0.5 text-xs text-secondary-foreground">
              <span
                className={`size-4 rounded-full ${getAvatarColor(name)} flex items-center justify-center text-[9px] font-medium text-white`}
              >
                {getInitials(name)}
              </span>
              {name}
            </span>
          )}
        />
      </MetadataRow>

      {/* Labels (ungrouped only when groups exist, all labels otherwise) */}
      <MetadataRow label="Labels">
        <ChipEditor
          values={hasGroups ? ungroupedLabels : task.metadata.labels}
          suggestions={knownLabels.filter((l) => !getGroupForLabel(l))}
          placeholder="Add label..."
          onChange={(labels) => {
            if (hasGroups) {
              // Preserve grouped labels, replace ungrouped
              const grouped = task.metadata.labels.filter((l) => getGroupForLabel(l))
              updateField({ labels: [...grouped, ...labels] })
            } else {
              updateField({ labels })
            }
          }}
          renderChip={(label) => {
            const colors = getLabelColor(label)
            return (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${colors.bg} ${colors.text} ${colors.border}`}
              >
                #{label}
              </span>
            )
          }}
        />
      </MetadataRow>

      {/* Priority */}
      <MetadataRow label="Priority">
        <PrioritySelector
          value={task.metadata.priority}
          onChange={(priority) => updateField({ priority })}
        />
      </MetadataRow>

      {/* Due date */}
      <MetadataRow label="Due date">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={task.metadata.dueDate ?? ''}
            onChange={(e) =>
              updateField({ dueDate: e.target.value || null })
            }
            className="text-sm bg-transparent border border-border/60 rounded-md px-2 py-1 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors duration-150"
          />
          {task.metadata.dueDate && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => updateField({ dueDate: null })}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </MetadataRow>

      {/* Estimate */}
      <MetadataRow label="Estimate">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            step={0.5}
            value={task.metadata.estimate ?? ''}
            onChange={(e) =>
              updateField({
                estimate: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
            placeholder="--"
            className="w-16 text-sm bg-transparent border border-border/60 rounded-md px-2 py-1 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 tabular-nums transition-colors duration-150"
          />
          <span className="text-xs text-muted-foreground font-mono">h</span>
        </div>
      </MetadataRow>

      {/* Created by (read-only display) */}
      {task.metadata.createdBy && (
        <MetadataRow label="Created by">
          <span className="text-sm text-muted-foreground">
            {task.metadata.createdBy}
          </span>
        </MetadataRow>
      )}

      {/* Built by (read-only display) */}
      {task.metadata.builtBy && (
        <MetadataRow label="Built by">
          <span className="text-sm text-muted-foreground">
            {task.metadata.builtBy}
          </span>
        </MetadataRow>
      )}
    </div>
  )
}

/* ── Metadata Row ── */

function MetadataRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 items-start">
      <span className="text-xs font-medium text-muted-foreground pt-1.5 uppercase tracking-wider">
        {label}
      </span>
      <div>{children}</div>
    </div>
  )
}

/* ── Chip Editor ── */

interface ChipEditorProps {
  values: string[]
  suggestions: string[]
  placeholder: string
  onChange: (values: string[]) => void
  renderChip: (value: string) => React.ReactNode
}

function ChipEditor({
  values,
  suggestions,
  placeholder,
  onChange,
  renderChip,
}: ChipEditorProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const filteredSuggestions = suggestions.filter(
    (s) =>
      !values.includes(s) &&
      s.toLowerCase().includes(inputValue.toLowerCase())
  )

  function handleAdd(val: string) {
    const trimmed = val.trim()
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed])
    }
    setInputValue('')
    setShowSuggestions(false)
    setIsAdding(false)
  }

  function handleRemove(val: string) {
    onChange(values.filter((v) => v !== val))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd(inputValue)
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setInputValue('')
      setShowSuggestions(false)
    }
  }

  return (
    <div className="space-y-1.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((val) => (
            <div key={val} className="inline-flex items-center gap-0.5 group/chip">
              {renderChip(val)}
              <button
                onClick={() => handleRemove(val)}
                className="size-4 rounded-full inline-flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors duration-150 -ml-1"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isAdding ? (
        <div className="relative">
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setShowSuggestions(true)
            }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay to allow clicking suggestions
              setTimeout(() => {
                setIsAdding(false)
                setInputValue('')
                setShowSuggestions(false)
              }, 200)
            }}
            placeholder={placeholder}
            className="w-full text-sm bg-transparent border border-border/60 rounded-md px-2 py-1 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors duration-150"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md z-50 max-h-32 overflow-y-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleAdd(suggestion)
                  }}
                  className="w-full text-left text-sm px-2.5 py-1.5 hover:bg-accent transition-colors duration-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-150"
        >
          <Plus className="size-3" />
          Add
        </button>
      )}
    </div>
  )
}

/* ── Group Selector (vocabulary label groups) ── */

interface GroupSelectorProps {
  options: string[]
  value: string | null
  onChange: (value: string | null) => void
}

function GroupSelector({ options, value, onChange }: GroupSelectorProps) {
  return (
    <div className="flex items-center flex-wrap gap-1">
      {options.map((opt) => {
        const isActive = value === opt
        return (
          <button
            key={opt}
            onClick={() => onChange(isActive ? null : opt)}
            className={`inline-flex items-center rounded-md px-2 py-1 text-xs transition-all duration-150 border capitalize ${
              isActive
                ? 'border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/20'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40'
            }`}
          >
            {opt.replace(/-/g, ' ')}
          </button>
        )
      })}
    </div>
  )
}

/* ── Priority Selector ── */

interface PrioritySelectorProps {
  value: 'high' | 'medium' | 'low' | null
  onChange: (value: 'high' | 'medium' | 'low' | null) => void
}

function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  const options = [
    { key: 'high' as const, label: 'High', dot: 'bg-red-500', ring: 'ring-red-500/30' },
    { key: 'medium' as const, label: 'Med', dot: 'bg-amber-500', ring: 'ring-amber-500/30' },
    { key: 'low' as const, label: 'Low', dot: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
  ]

  return (
    <div className="flex items-center gap-1.5">
      {options.map((opt) => {
        const isActive = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(isActive ? null : opt.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all duration-150 border ${
              isActive
                ? `border-border bg-accent/80 text-foreground ring-2 ${opt.ring}`
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40'
            }`}
          >
            <span className={`size-2 rounded-full ${opt.dot}`} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
