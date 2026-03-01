import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'home' | 'project-home' | 'editor' | 'checklist' | 'kanban' | 'memory'

interface UiStore {
  activeView: ViewMode
  setActiveView: (view: ViewMode) => void

  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void

  editorPanelWidth: number
  setEditorPanelWidth: (width: number) => void

  selectedTaskId: string | null
  setSelectedTaskId: (id: string | null) => void

  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  promptsLibraryOpen: boolean
  setPromptsLibraryOpen: (open: boolean) => void

  showSplitEditor: boolean
  toggleSplitEditor: () => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      activeView: 'home' as ViewMode,
      setActiveView: (view) => set({ activeView: view }),

      activeProjectId: null as string | null,
      setActiveProjectId: (id) => set({ activeProjectId: id }),

      editorPanelWidth: 50,
      setEditorPanelWidth: (width) => set({ editorPanelWidth: width }),

      selectedTaskId: null as string | null,
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),

      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      promptsLibraryOpen: false,
      setPromptsLibraryOpen: (open) => set({ promptsLibraryOpen: open }),

      showSplitEditor: false,
      toggleSplitEditor: () => set((s) => ({ showSplitEditor: !s.showSplitEditor })),
    }),
    {
      name: 'automd-ui',
      partialize: (state) => ({
        activeView: state.activeView,
        editorPanelWidth: state.editorPanelWidth,
        sidebarOpen: state.sidebarOpen,
        showSplitEditor: state.showSplitEditor,
      }),
      // Migrate persisted 'dashboard' → 'home'
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<UiStore>) }
        if ((merged.activeView as string) === 'dashboard') {
          merged.activeView = 'home'
        }
        return merged
      },
    }
  )
)
