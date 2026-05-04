import { create } from 'zustand'
import type { Agent } from '@/lib/markdown/types'
import { apiFetch } from '@/lib/api'

export interface AgentMetrics {
  agentId: string
  slug: string
  totalTasks: number
  completedTasks: number
  openTasks: number
  blockedTasks: number
  helpWantedTasks: number
  learningsCount: number
  completionRate: number
  avgCycleTimeMs: number | null
  cycleSampleSize: number
  reopenCount: number
  reopenRate: number
}

interface AgentsStore {
  agents: Agent[]
  metrics: Record<string, AgentMetrics>
  selectedAgentId: string | null
  setSelectedAgentId: (id: string | null) => void
  loadAgents: () => Promise<void>
  loadAgentMetrics: (id: string) => Promise<void>
  createAgent: (name: string) => Promise<void>
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: [],
  metrics: {},
  selectedAgentId: null,
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  loadAgents: async () => {
    const res = await apiFetch<Agent[]>('/agents')
    if (res.ok) set({ agents: res.data })
  },
  loadAgentMetrics: async (id) => {
    const res = await apiFetch<AgentMetrics>(`/agents/${id}/metrics`)
    if (res.ok) set({ metrics: { ...get().metrics, [id]: res.data, [res.data.slug]: res.data } })
  },
  createAgent: async (name) => {
    const res = await apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify({ name }) })
    if (res.ok) set({ agents: [...get().agents, res.data] })
  },
}))
