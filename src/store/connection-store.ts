import { create } from 'zustand'

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

interface ConnectionStore {
  status: ConnectionStatus
  setStatus: (status: ConnectionStatus) => void
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}))
