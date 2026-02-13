import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CardDisplayPreferences {
  showLabels: boolean
  showAssignees: boolean
  showDueDate: boolean
  showPriority: boolean
  showEstimate: boolean
  showSubtaskProgress: boolean
  showSignatures: boolean
}

const DEFAULT_PREFS: CardDisplayPreferences = {
  showLabels: true,
  showAssignees: true,
  showDueDate: true,
  showPriority: true,
  showEstimate: false,
  showSubtaskProgress: true,
  showSignatures: false,
}

interface PreferencesStore {
  cardDisplay: CardDisplayPreferences
  setCardDisplay: (prefs: Partial<CardDisplayPreferences>) => void
  resetCardDisplay: () => void
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      cardDisplay: { ...DEFAULT_PREFS },
      setCardDisplay: (prefs) =>
        set((state) => ({
          cardDisplay: { ...state.cardDisplay, ...prefs },
        })),
      resetCardDisplay: () => set({ cardDisplay: { ...DEFAULT_PREFS } }),
    }),
    { name: 'automd-preferences' }
  )
)
