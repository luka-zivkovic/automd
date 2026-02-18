import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface ActivityEvent {
  id: string
  type: string
  description: string
  actor: string
  timestamp: number
  fileId?: string
  fileName?: string
}

const MAX_EVENTS = 100

interface ActivityStore {
  events: ActivityEvent[]
  isOpen: boolean
  unreadCount: number
  addEvent: (event: Omit<ActivityEvent, 'id'>) => void
  setOpen: (open: boolean) => void
  clear: () => void
}

export const useActivityStore = create<ActivityStore>()((set, get) => ({
  events: [],
  isOpen: false,
  unreadCount: 0,

  addEvent: (event) => {
    const { events, isOpen } = get()
    // Deduplicate consecutive file:updated events for the same file
    if (
      event.type === 'file:updated' &&
      events.length > 0 &&
      events[0].type === 'file:updated' &&
      events[0].fileId === event.fileId
    ) {
      const updated = [{ ...events[0], timestamp: event.timestamp, description: event.description, actor: event.actor }, ...events.slice(1)]
      set({ events: updated })
      return
    }
    const newEvent = { ...event, id: nanoid(8) }
    set((state) => ({
      events: [newEvent, ...state.events].slice(0, MAX_EVENTS),
      unreadCount: isOpen ? 0 : state.unreadCount + 1,
    }))
  },

  setOpen: (open) => set({ isOpen: open, unreadCount: open ? 0 : get().unreadCount }),

  clear: () => set({ events: [], unreadCount: 0 }),
}))
