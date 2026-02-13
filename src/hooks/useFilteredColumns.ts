import { useMemo } from 'react'
import type { Column, Task } from '@/lib/markdown/types'
import { useFilterStore } from '@/store/filter-store'

function taskMatchesFilters(
  task: Task,
  searchQuery: string,
  assigneeFilter: string[],
  labelFilter: string[],
  priorityFilter: ('high' | 'medium' | 'low')[],
  statusFilter: 'all' | 'done' | 'todo'
): boolean {
  // Search query filter (case-insensitive match on displayContent)
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    if (!task.displayContent.toLowerCase().includes(q)) {
      return false
    }
  }

  // Assignee filter: task must have at least one matching assignee
  if (assigneeFilter.length > 0) {
    const hasMatch = task.metadata.assignees.some((a) =>
      assigneeFilter.includes(a)
    )
    if (!hasMatch) return false
  }

  // Label filter: task must have at least one matching label
  if (labelFilter.length > 0) {
    const hasMatch = task.metadata.labels.some((l) =>
      labelFilter.includes(l)
    )
    if (!hasMatch) return false
  }

  // Priority filter: task priority must be in the list
  if (priorityFilter.length > 0) {
    if (!task.metadata.priority || !priorityFilter.includes(task.metadata.priority)) {
      return false
    }
  }

  // Status filter
  if (statusFilter === 'done' && !task.checked) return false
  if (statusFilter === 'todo' && task.checked) return false

  return true
}

export function useFilteredColumns(columns: Column[]): Column[] {
  const searchQuery = useFilterStore((s) => s.searchQuery)
  const assigneeFilter = useFilterStore((s) => s.assigneeFilter)
  const labelFilter = useFilterStore((s) => s.labelFilter)
  const priorityFilter = useFilterStore((s) => s.priorityFilter)
  const statusFilter = useFilterStore((s) => s.statusFilter)

  return useMemo(() => {
    // If no filters are active, return columns as-is
    const hasFilters =
      searchQuery !== '' ||
      assigneeFilter.length > 0 ||
      labelFilter.length > 0 ||
      priorityFilter.length > 0 ||
      statusFilter !== 'all'

    if (!hasFilters) return columns

    return columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((task) =>
        taskMatchesFilters(
          task,
          searchQuery,
          assigneeFilter,
          labelFilter,
          priorityFilter,
          statusFilter
        )
      ),
    }))
  }, [columns, searchQuery, assigneeFilter, labelFilter, priorityFilter, statusFilter])
}
