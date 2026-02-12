import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import { useFilterStore } from '@/store/filter-store'
import { useKnownAssignees, useKnownLabels } from '@/lib/selectors'
import { FilterChip } from './FilterChip'

const PRIORITIES = ['high', 'medium', 'low'] as const
const STATUS_OPTIONS = ['all', 'done', 'todo'] as const

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 dark:text-red-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-slate-500 dark:text-slate-400',
}

function FilterDropdown({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open) onToggle()
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onToggle])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/40 whitespace-nowrap"
      >
        {label}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[160px] bg-popover border border-border rounded-lg shadow-lg p-1.5 z-50">
          {children}
        </div>
      )}
    </div>
  )
}

export function FilterBar() {
  const searchQuery = useFilterStore((s) => s.searchQuery)
  const setSearchQuery = useFilterStore((s) => s.setSearchQuery)
  const assigneeFilter = useFilterStore((s) => s.assigneeFilter)
  const toggleAssigneeFilter = useFilterStore((s) => s.toggleAssigneeFilter)
  const labelFilter = useFilterStore((s) => s.labelFilter)
  const toggleLabelFilter = useFilterStore((s) => s.toggleLabelFilter)
  const priorityFilter = useFilterStore((s) => s.priorityFilter)
  const togglePriorityFilter = useFilterStore((s) => s.togglePriorityFilter)
  const statusFilter = useFilterStore((s) => s.statusFilter)
  const setStatusFilter = useFilterStore((s) => s.setStatusFilter)
  const clearAllFilters = useFilterStore((s) => s.clearAllFilters)
  const hasActiveFilters = useFilterStore((s) => s.hasActiveFilters)

  const knownAssignees = useKnownAssignees()
  const knownLabels = useKnownLabels()

  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const isActive = hasActiveFilters()

  function toggleDropdown(name: string) {
    setOpenDropdown((prev) => (prev === name ? null : name))
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2 border-b border-border/50">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Search input */}
        <div className="relative flex-shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="h-7 w-44 rounded-md border border-input bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Assignee filter */}
        {knownAssignees.length > 0 && (
          <FilterDropdown
            label="Assignee"
            open={openDropdown === 'assignee'}
            onToggle={() => toggleDropdown('assignee')}
          >
            {knownAssignees.map((a) => (
              <label
                key={a}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={assigneeFilter.includes(a)}
                  onChange={() => toggleAssigneeFilter(a)}
                  className="rounded border-input"
                />
                <span className="text-xs">@{a}</span>
              </label>
            ))}
          </FilterDropdown>
        )}

        {/* Label filter */}
        {knownLabels.length > 0 && (
          <FilterDropdown
            label="Label"
            open={openDropdown === 'label'}
            onToggle={() => toggleDropdown('label')}
          >
            {knownLabels.map((l) => (
              <label
                key={l}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={labelFilter.includes(l)}
                  onChange={() => toggleLabelFilter(l)}
                  className="rounded border-input"
                />
                <span className="text-xs">#{l}</span>
              </label>
            ))}
          </FilterDropdown>
        )}

        {/* Priority filter */}
        <FilterDropdown
          label="Priority"
          open={openDropdown === 'priority'}
          onToggle={() => toggleDropdown('priority')}
        >
          {PRIORITIES.map((p) => (
            <label
              key={p}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={priorityFilter.includes(p)}
                onChange={() => togglePriorityFilter(p)}
                className="rounded border-input"
              />
              <span className={`text-xs capitalize ${PRIORITY_COLORS[p]}`}>
                {p}
              </span>
            </label>
          ))}
        </FilterDropdown>

        {/* Status filter */}
        <FilterDropdown
          label="Status"
          open={openDropdown === 'status'}
          onToggle={() => toggleDropdown('status')}
        >
          {STATUS_OPTIONS.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 cursor-pointer text-sm"
            >
              <input
                type="radio"
                name="status-filter"
                checked={statusFilter === s}
                onChange={() => setStatusFilter(s)}
                className="border-input"
              />
              <span className="text-xs capitalize">{s}</span>
            </label>
          ))}
        </FilterDropdown>

        {/* Clear all */}
        {isActive && (
          <button
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/40 whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {isActive && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {assigneeFilter.map((a) => (
            <FilterChip
              key={`assignee-${a}`}
              label={`@${a}`}
              onRemove={() => toggleAssigneeFilter(a)}
            />
          ))}
          {labelFilter.map((l) => (
            <FilterChip
              key={`label-${l}`}
              label={`#${l}`}
              onRemove={() => toggleLabelFilter(l)}
            />
          ))}
          {priorityFilter.map((p) => (
            <FilterChip
              key={`priority-${p}`}
              label={p}
              onRemove={() => togglePriorityFilter(p)}
            />
          ))}
          {statusFilter !== 'all' && (
            <FilterChip
              label={statusFilter === 'done' ? 'Done' : 'To do'}
              onRemove={() => setStatusFilter('all')}
            />
          )}
        </div>
      )}
    </div>
  )
}
