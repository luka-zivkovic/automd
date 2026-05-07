import { create } from 'zustand'
import type { Agent, Skill } from '@/lib/markdown/types'
import { apiFetch } from '@/lib/api'

export type SkillSummary = Omit<Skill, 'body'>

export interface SkillImportResult {
  skill: Skill
  created: boolean
  bytes: number
  source: {
    provider: 'github'
    url: string
  }
}

function cleanApiError(error: string): string {
  try {
    const parsed = JSON.parse(error)
    if (parsed && typeof parsed.error === 'string') return parsed.error
  } catch {}
  return error
}

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
  skills: SkillSummary[]
  metrics: Record<string, AgentMetrics>
  selectedAgentId: string | null
  skillsError: string | null
  isImportingSkill: boolean
  setSelectedAgentId: (id: string | null) => void
  loadAgents: () => Promise<void>
  loadSkills: () => Promise<void>
  loadAgentMetrics: (id: string) => Promise<void>
  createAgent: (name: string) => Promise<void>
  importSkill: (sourceUrl: string, options?: { slug?: string; overwrite?: boolean }) => Promise<SkillImportResult | null>
  updateAgentSkills: (id: string, skills: string[]) => Promise<Agent | null>
}

export const useAgentsStore = create<AgentsStore>((set, get) => ({
  agents: [],
  skills: [],
  metrics: {},
  selectedAgentId: null,
  skillsError: null,
  isImportingSkill: false,
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  loadAgents: async () => {
    const res = await apiFetch<Agent[]>('/agents')
    if (res.ok) set({ agents: res.data })
  },
  loadSkills: async () => {
    const res = await apiFetch<SkillSummary[]>('/skills')
    if (res.ok) set({ skills: res.data, skillsError: null })
    else set({ skillsError: cleanApiError(res.error) })
  },
  loadAgentMetrics: async (id) => {
    const res = await apiFetch<AgentMetrics>(`/agents/${id}/metrics`)
    if (res.ok) set({ metrics: { ...get().metrics, [id]: res.data, [res.data.slug]: res.data } })
  },
  createAgent: async (name) => {
    const res = await apiFetch<Agent>('/agents', { method: 'POST', body: JSON.stringify({ name }) })
    if (res.ok) set({ agents: [...get().agents, res.data] })
  },
  importSkill: async (sourceUrl, options = {}) => {
    set({ isImportingSkill: true, skillsError: null })
    const res = await apiFetch<SkillImportResult>('/skills/import', {
      method: 'POST',
      timeoutMs: 30_000,
      body: JSON.stringify({
        sourceUrl,
        ...(options.slug ? { slug: options.slug } : {}),
        ...(options.overwrite ? { overwrite: true } : {}),
      }),
    })
    set({ isImportingSkill: false })
    if (!res.ok) {
      set({ skillsError: cleanApiError(res.error) })
      return null
    }
    await get().loadSkills()
    return res.data
  },
  updateAgentSkills: async (id, skills) => {
    const res = await apiFetch<Agent>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ skills }),
    })
    if (!res.ok) return null
    set({
      agents: get().agents.map((agent) => (
        agent.id === res.data.id || agent.slug === res.data.slug ? res.data : agent
      )),
    })
    return res.data
  },
}))
