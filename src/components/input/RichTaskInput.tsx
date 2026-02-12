import { useState, useRef, useEffect, useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { serializeMetadata } from '@/lib/markdown/metadata-serializer'
import { emptyMetadata } from '@/lib/markdown/metadata-parser'
import { getLabelColor, getAvatarColor, getInitials, formatDueDate } from '@/lib/utils/metadata-colors'
import { Button } from '@/components/ui/button'
import { AssigneePicker } from './AssigneePicker'
import { LabelPicker } from './LabelPicker'
import { PriorityPicker } from './PriorityPicker'
import { DueDatePicker } from './DueDatePicker'
import { EstimateInput } from './EstimateInput'
import { Plus, User, Tag, Circle, Calendar, Clock, X } from 'lucide-react'
import type { TaskMetadata } from '@/lib/markdown/types'

interface RichTaskInputProps {
  columnId: string
}

type PickerType = 'assignee' | 'label' | 'priority' | 'date' | 'estimate' | null

interface LocalMetadata {
  assignees: string[]
  labels: string[]
  priority: TaskMetadata['priority']
  dueDate: string | null
  estimate: number | null
}

function emptyLocalMetadata(): LocalMetadata {
  return {
    assignees: [],
    labels: [],
    priority: null,
    dueDate: null,
    estimate: null,
  }
}

function hasMetadata(meta: LocalMetadata): boolean {
  return (
    meta.assignees.length > 0 ||
    meta.labels.length > 0 ||
    meta.priority !== null ||
    meta.dueDate !== null ||
    meta.estimate !== null
  )
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
}

const PRIORITY_TEXT_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-emerald-600 dark:text-emerald-400',
}

export function RichTaskInput({ columnId }: RichTaskInputProps) {
  const addTask = useDocumentStore((s) => s.addTask)
  const [isExpanded, setIsExpanded] = useState(false)
  const [text, setText] = useState('')
  const [metadata, setMetadata] = useState<LocalMetadata>(emptyLocalMetadata())
  const [activePicker, setActivePicker] = useState<PickerType>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Focus the text input when expanded
  useEffect(() => {
    if (isExpanded) {
      // Small delay to let the DOM render
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isExpanded])

  // Close pickers on outside click
  useEffect(() => {
    if (!isExpanded) return

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // If there's no text and no metadata, collapse entirely
        if (!text.trim() && !hasMetadata(metadata)) {
          setIsExpanded(false)
          setActivePicker(null)
        } else {
          // Just close the picker
          setActivePicker(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isExpanded, text, metadata])

  const resetState = useCallback(() => {
    setText('')
    setMetadata(emptyLocalMetadata())
    setActivePicker(null)
  }, [])

  function handleSubmit() {
    const trimmed = text.trim()
    if (!trimmed) return

    const fullMetadata = {
      ...emptyMetadata(),
      assignees: metadata.assignees,
      labels: metadata.labels,
      priority: metadata.priority,
      dueDate: metadata.dueDate,
      estimate: metadata.estimate,
    }

    const serialized = serializeMetadata(trimmed, fullMetadata)
    addTask(columnId, serialized)
    resetState()
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      if (activePicker) {
        setActivePicker(null)
      } else {
        setIsExpanded(false)
        resetState()
      }
    }
  }

  function togglePicker(picker: PickerType) {
    setActivePicker((current) => (current === picker ? null : picker))
  }

  // Collapsed state — matches original AddTaskInput button style
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1.5 mt-3 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/40 transition-colors duration-150 w-full"
      >
        <Plus className="size-3.5" />
        <span>Add task</span>
      </button>
    )
  }

  // Expanded state
  return (
    <div
      ref={containerRef}
      className="mt-3 rounded-lg border border-input bg-background shadow-sm overflow-hidden"
    >
      {/* Text input */}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What needs to be done?"
        className="w-full text-sm bg-transparent px-3 py-2.5 outline-none placeholder:text-muted-foreground/50"
      />

      {/* Toolbar + chips + add button */}
      <div className="flex items-center gap-1 px-2 pb-2 border-t border-border/50">
        {/* Toolbar buttons */}
        <div className="flex items-center gap-0.5 py-1">
          <ToolbarButton
            active={activePicker === 'assignee'}
            hasValue={metadata.assignees.length > 0}
            onClick={() => togglePicker('assignee')}
            title="Assign"
          >
            <User className="size-3.5" />
          </ToolbarButton>

          <ToolbarButton
            active={activePicker === 'label'}
            hasValue={metadata.labels.length > 0}
            onClick={() => togglePicker('label')}
            title="Label"
          >
            <Tag className="size-3.5" />
          </ToolbarButton>

          <ToolbarButton
            active={activePicker === 'priority'}
            hasValue={metadata.priority !== null}
            onClick={() => togglePicker('priority')}
            title="Priority"
          >
            <Circle className="size-3.5" />
          </ToolbarButton>

          <ToolbarButton
            active={activePicker === 'date'}
            hasValue={metadata.dueDate !== null}
            onClick={() => togglePicker('date')}
            title="Due date"
          >
            <Calendar className="size-3.5" />
          </ToolbarButton>

          <ToolbarButton
            active={activePicker === 'estimate'}
            hasValue={metadata.estimate !== null}
            onClick={() => togglePicker('estimate')}
            title="Estimate"
          >
            <Clock className="size-3.5" />
          </ToolbarButton>
        </div>

        {/* Metadata chips */}
        {hasMetadata(metadata) && (
          <div className="flex items-center gap-1 flex-1 overflow-x-auto px-1">
            {metadata.assignees.map((a) => (
              <MetadataChip key={`a-${a}`} onRemove={() => setMetadata((m) => ({ ...m, assignees: m.assignees.filter((x) => x !== a) }))}>
                <span className={`inline-flex items-center justify-center size-3.5 rounded-full text-[8px] font-bold text-white ${getAvatarColor(a)}`}>
                  {getInitials(a)}
                </span>
                <span>@{a}</span>
              </MetadataChip>
            ))}

            {metadata.labels.map((l) => {
              const colors = getLabelColor(l)
              return (
                <MetadataChip
                  key={`l-${l}`}
                  className={`${colors.bg} ${colors.text} ${colors.border} border`}
                  onRemove={() => setMetadata((m) => ({ ...m, labels: m.labels.filter((x) => x !== l) }))}
                >
                  <span>#{l}</span>
                </MetadataChip>
              )
            })}

            {metadata.priority && (
              <MetadataChip onRemove={() => setMetadata((m) => ({ ...m, priority: null }))}>
                <span className={`size-2 rounded-full ${PRIORITY_COLORS[metadata.priority]}`} />
                <span className={PRIORITY_TEXT_COLORS[metadata.priority]}>{metadata.priority}</span>
              </MetadataChip>
            )}

            {metadata.dueDate && (
              <MetadataChip onRemove={() => setMetadata((m) => ({ ...m, dueDate: null }))}>
                <Calendar className="size-2.5 text-muted-foreground" />
                <span>{formatDueDate(metadata.dueDate)}</span>
              </MetadataChip>
            )}

            {metadata.estimate !== null && (
              <MetadataChip onRemove={() => setMetadata((m) => ({ ...m, estimate: null }))}>
                <Clock className="size-2.5 text-muted-foreground" />
                <span>{metadata.estimate}h</span>
              </MetadataChip>
            )}
          </div>
        )}

        {/* Spacer when no chips */}
        {!hasMetadata(metadata) && <div className="flex-1" />}

        {/* Add button */}
        <Button
          size="xs"
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="ml-auto shrink-0"
        >
          Add
        </Button>
      </div>

      {/* Active picker area */}
      {activePicker === 'assignee' && (
        <div className="border-t border-border/50">
          <AssigneePicker
            value={metadata.assignees}
            onChange={(assignees) => setMetadata((m) => ({ ...m, assignees }))}
          />
        </div>
      )}

      {activePicker === 'label' && (
        <div className="border-t border-border/50">
          <LabelPicker
            value={metadata.labels}
            onChange={(labels) => setMetadata((m) => ({ ...m, labels }))}
          />
        </div>
      )}

      {activePicker === 'priority' && (
        <div className="border-t border-border/50">
          <PriorityPicker
            value={metadata.priority}
            onChange={(priority) => setMetadata((m) => ({ ...m, priority }))}
          />
        </div>
      )}

      {activePicker === 'date' && (
        <div className="border-t border-border/50">
          <DueDatePicker
            value={metadata.dueDate}
            onChange={(dueDate) => setMetadata((m) => ({ ...m, dueDate }))}
          />
        </div>
      )}

      {activePicker === 'estimate' && (
        <div className="border-t border-border/50">
          <EstimateInput
            value={metadata.estimate}
            onChange={(estimate) => setMetadata((m) => ({ ...m, estimate }))}
          />
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

function ToolbarButton({
  active,
  hasValue,
  onClick,
  title,
  children,
}: {
  active: boolean
  hasValue: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center size-7 rounded-md transition-colors ${
        active
          ? 'bg-primary/10 text-primary'
          : hasValue
            ? 'text-foreground bg-accent/50'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'
      }`}
    >
      {children}
    </button>
  )
}

function MetadataChip({
  children,
  className = '',
  onRemove,
}: {
  children: React.ReactNode
  className?: string
  onRemove: () => void
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${
        className || 'bg-secondary text-secondary-foreground'
      }`}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
      >
        <X className="size-2" />
      </button>
    </span>
  )
}
