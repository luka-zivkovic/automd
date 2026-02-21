import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthStatus = 'loading' | 'needs-setup' | 'unauthenticated' | 'authenticated'

interface AuthStore {
  status: AuthStatus
  token: string | null
  email: string | null
  setAuth: (token: string, email: string) => void
  clearAuth: () => void
  setStatus: (status: AuthStatus) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      status: 'loading' as AuthStatus,
      token: null,
      email: null,
      setAuth: (token, email) => set({ token, email, status: 'authenticated' }),
      clearAuth: () => set({ token: null, email: null, status: 'unauthenticated' }),
      setStatus: (status) => set({ status }),
    }),
    {
      name: 'automd-auth',
      partialize: (state) => ({ token: state.token, email: state.email }),
    }
  )
)
