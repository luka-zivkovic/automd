import { create } from 'zustand'

interface FilterStore {
  searchQuery: string
  assigneeFilter: string[]
  labelFilter: string[]
  priorityFilter: ('high' | 'medium' | 'low')[]
  statusFilter: 'all' | 'done' | 'todo'

  setSearchQuery: (q: string) => void
  toggleAssigneeFilter: (a: string) => void
  toggleLabelFilter: (l: string) => void
  togglePriorityFilter: (p: 'high' | 'medium' | 'low') => void
  setStatusFilter: (s: 'all' | 'done' | 'todo') => void
  clearAllFilters: () => void
  hasActiveFilters: () => boolean
}

export const useFilterStore = create<FilterStore>()((set, get) => ({
  searchQuery: '',
  assigneeFilter: [],
  labelFilter: [],
  priorityFilter: [],
  statusFilter: 'all',

  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleAssigneeFilter: (a) =>
    set((state) => ({
      assigneeFilter: state.assigneeFilter.includes(a)
        ? state.assigneeFilter.filter((x) => x !== a)
        : [...state.assigneeFilter, a],
    })),

  toggleLabelFilter: (l) =>
    set((state) => ({
      labelFilter: state.labelFilter.includes(l)
        ? state.labelFilter.filter((x) => x !== l)
        : [...state.labelFilter, l],
    })),

  togglePriorityFilter: (p) =>
    set((state) => ({
      priorityFilter: state.priorityFilter.includes(p)
        ? state.priorityFilter.filter((x) => x !== p)
        : [...state.priorityFilter, p],
    })),

  setStatusFilter: (s) => set({ statusFilter: s }),

  clearAllFilters: () =>
    set({
      searchQuery: '',
      assigneeFilter: [],
      labelFilter: [],
      priorityFilter: [],
      statusFilter: 'all',
    }),

  hasActiveFilters: () => {
    const s = get()
    return (
      s.searchQuery !== '' ||
      s.assigneeFilter.length > 0 ||
      s.labelFilter.length > 0 ||
      s.priorityFilter.length > 0 ||
      s.statusFilter !== 'all'
    )
  },
}))
