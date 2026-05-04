import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Agent } from '@automd/shared'
import { getAutomdDir } from './config.js'
import * as storage from './storage.js'
import { invalidateBoardCache, parseBoard } from './board-cache.js'
import { serializeAst, updateTaskMetadata } from '@automd/shared'
import { broadcast } from './ws.js'
import { appendActivity } from './activity-storage.js'

function agentsDir() { return path.join(getAutomdDir(), 'agents') }
function agentPath(slug: string) { return path.join(agentsDir(), slug, 'AGENT.md') }

export function slugifyAgent(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent'
}

function ensureDir(slug?: string) {
  fs.mkdirSync(slug ? path.join(agentsDir(), slug) : agentsDir(), { recursive: true })
}

function defaultAgent(slug: string, partial: Partial<Agent> = {}): Agent {
  const now = Date.now()
  return {
    id: partial.id ?? nanoid(10),
    name: partial.name ?? slug,
    slug,
    avatar: partial.avatar ?? null,
    runtime: partial.runtime ?? 'unknown',
    model: partial.model ?? null,
    status: partial.status ?? 'active',
    mcpServers: partial.mcpServers ?? [],
    env: partial.env ?? {},
    capabilities: partial.capabilities ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    body: partial.body ?? '',
  }
}

function parseAgentMarkdown(markdown: string, fallbackSlug: string): Agent {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(markdown)
  if (!match) return defaultAgent(fallbackSlug, { body: markdown })
  try {
    const meta = JSON.parse(match[1])
    return defaultAgent(meta.slug ?? fallbackSlug, { ...meta, body: match[2].trimStart() })
  } catch {
    return defaultAgent(fallbackSlug, { body: match[2].trimStart() })
  }
}

function serializeAgent(agent: Agent): string {
  const { body, ...meta } = { ...agent, updatedAt: agent.updatedAt ?? Date.now() }
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n\n${body ?? ''}`
}

export function listAgents(): Agent[] {
  ensureDir()
  return fs.readdirSync(agentsDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => getAgentBySlug(d.name))
    .filter((a): a is Agent => !!a)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getAgentBySlug(slug: string): Agent | null {
  const p = agentPath(slug)
  if (!fs.existsSync(p)) return null
  return parseAgentMarkdown(fs.readFileSync(p, 'utf-8'), slug)
}

export function getAgent(idOrSlug: string): Agent | null {
  return listAgents().find((a) => a.id === idOrSlug || a.slug === idOrSlug) ?? null
}

export function saveAgent(agent: Agent): Agent {
  const slug = slugifyAgent(agent.slug || agent.name)
  const next = { ...agent, slug, updatedAt: Date.now() }
  ensureDir(slug)
  const p = agentPath(slug)
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, serializeAgent(next), 'utf-8')
  fs.renameSync(tmp, p)
  return next
}

export function createAgent(input: Partial<Agent> & { name: string }): Agent {
  const slug = slugifyAgent(input.slug ?? input.name)
  if (getAgentBySlug(slug)) throw new Error('Agent slug already exists')
  return saveAgent(defaultAgent(slug, input))
}

export function updateAgent(idOrSlug: string, input: Partial<Agent>): Agent | null {
  const existing = getAgent(idOrSlug)
  if (!existing) return null
  return saveAgent({ ...existing, ...input, id: existing.id, slug: input.slug ? slugifyAgent(input.slug) : existing.slug })
}

export function ensureAgentStubsFromTasks(): number {
  const existing = new Set(listAgents().map((a) => a.slug))
  const slugs = new Set<string>()
  for (const file of storage.listFiles()) {
    const { tasks } = parseBoard(file.markdown, file.id)
    const stack = [...tasks]
    while (stack.length) {
      const task = stack.pop()!
      if (task.metadata.builtBy) slugs.add(slugifyAgent(task.metadata.builtBy))
      stack.push(...task.children)
    }
  }
  let created = 0
  for (const slug of slugs) {
    if (existing.has(slug)) continue
    saveAgent(defaultAgent(slug, { name: slug, status: 'archived', runtime: 'unknown' }))
    created++
  }
  return created
}

export function releaseStaleClaims(maxAgeMs = 6 * 60 * 60 * 1000): number {
  const now = Date.now()
  let released = 0
  for (const file of storage.listFiles()) {
    const { ast, tasks } = parseBoard(file.markdown, file.id)
    let currentAst = ast
    let changed = false
    const releasedTasks: Array<{ taskId: string; taskTitle: string; slug: string | null }> = []
    const stack = [...tasks]
    while (stack.length) {
      const task = stack.pop()!
      stack.push(...task.children)
      if (!task.metadata.claimedAt || task.checked) continue
      const claimedAt = new Date(task.metadata.claimedAt).getTime()
      if (Number.isNaN(claimedAt) || now - claimedAt <= maxAgeMs) continue
      currentAst = updateTaskMetadata(currentAst, task.id, task.displayContent, {
        ...task.metadata,
        builtBy: null,
        claimedAt: null,
      })
      changed = true
      releasedTasks.push({ taskId: task.id, taskTitle: task.displayContent, slug: task.metadata.builtBy })
      released++
    }
    if (changed) {
      invalidateBoardCache(file.id)
      const saved = storage.updateFileMarkdown(file.id, serializeAst(currentAst))
      if (saved) {
        broadcast({ type: 'file:updated', payload: { id: saved.id, markdown: saved.markdown } })
        for (const task of releasedTasks) {
          appendActivity({
            type: 'task.claim_released',
            itemId: saved.id,
            itemName: saved.name,
            taskId: task.taskId,
            taskTitle: task.taskTitle,
            agentSlug: task.slug,
          })
          broadcast({ type: 'task:claim_released', payload: { itemId: saved.id, taskId: task.taskId, slug: task.slug, reason: 'stale' } })
        }
      }
    }
  }
  return released
}
