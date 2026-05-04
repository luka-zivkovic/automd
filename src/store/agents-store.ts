import { create } from 'zustand'
import type { Agent } from '@/lib/markdown/types'
import { apiFetch } from '@/lib/api'

interface AgentsStore {
  agents: Agent[]
  selectedAgentId: string | null
  setSelectedAgentId: (id: string | null) => void
  loadAgents: () => Promise<void>
  createAgent: (name: string) => Promise<void>
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  loadAgents: async () => {
    const res = await apiFetch<Agent[]>('/agents')
    if (res.ok) set({ agents: res.data })
  },
  createAgent: async (name) => {
    const res = await apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify({ name }) })
    if (res.ok) set({ agents: [...get().agents, res.data] })
  },
}))
