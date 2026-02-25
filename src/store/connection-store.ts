import { create } from 'zustand'
import { HAS_SERVER } from '@/lib/api'

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

export interface ConnectedAgent {
  username: string
  connectedAt: number
}

interface ConnectionStore {
  status: ConnectionStatus
  agents: ConnectedAgent[]
  isLoading: boolean
  lastError: string | null
  setStatus: (status: ConnectionStatus) => void
  setAgents: (agents: ConnectedAgent[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  status: 'disconnected',
  agents: [],
  isLoading: HAS_SERVER,
  lastError: null,
  setStatus: (status) => set({ status }),
  setAgents: (agents) => set({ agents }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (lastError) => set({ lastError }),
}))
