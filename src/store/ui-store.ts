import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'editor' | 'checklist' | 'kanban'

interface UiStore {
  activeView: ViewMode
  setActiveView: (view: ViewMode) => void

  editorPanelWidth: number
  setEditorPanelWidth: (width: number) => void
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      activeView: 'editor',
      setActiveView: (view) => set({ activeView: view }),

      editorPanelWidth: 50,
      setEditorPanelWidth: (width) => set({ editorPanelWidth: width }),
    }),
    {
      name: 'automd-ui',
    }
  )
)
