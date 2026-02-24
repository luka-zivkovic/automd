import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'dashboard' | 'editor' | 'checklist' | 'kanban'

interface UiStore {
  activeView: ViewMode
  setActiveView: (view: ViewMode) => void

  editorPanelWidth: number
  setEditorPanelWidth: (width: number) => void

  selectedTaskId: string | null
  setSelectedTaskId: (id: string | null) => void

  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  showSplitEditor: boolean
  toggleSplitEditor: () => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      activeView: 'editor',
      setActiveView: (view) => set({ activeView: view }),

      editorPanelWidth: 50,
      setEditorPanelWidth: (width) => set({ editorPanelWidth: width }),

      selectedTaskId: null,
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),

      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

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
    }
  )
)
