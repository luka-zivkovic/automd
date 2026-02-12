import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

interface UserStore {
  username: string
  setUsername: (name: string) => void
}

export const useUserStore = create<UserStore>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        username: '',
        setUsername: (name: string) => set({ username: name.trim() }),
      }),
      { name: 'automd-user' }
    )
  )
)
