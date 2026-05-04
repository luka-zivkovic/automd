import { Router } from 'express'
import type { Agent, Task, TaskMetadata } from '@automd/shared'
import { serializeAst, updateTaskMetadata } from '@automd/shared'
import { createAgent, getAgent, listAgents, updateAgent, ensureAgentStubsFromTasks } from '../agent-storage.js'
import { getAgentIdFromCredential } from '../auth-storage.js'
import { extractToken } from '../auth-middleware.js'
import { isValidId } from '../validation.js'
import * as storage from '../storage.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'
import { withWriteLock } from '../write-lock.js'
import { broadcast } from '../ws.js'
import { queueEmbeddingUpdate } from '../embeddings/index.js'

export const agentsRouter = Router()

const RUNTIMES = new Set(['claude-code', 'codex', 'cursor', 'unknown'])
const STATUSES = new Set(['active', 'paused', 'archived'])
const ENV_DENY_RE = /^(AUTOMD_|.*(?:API_KEY|SECRET|TOKEN).*)/i

function cleanText(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLen) : undefined
}

function cleanStringArray(value: unknown, maxItems = 50, maxLen = 100): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems)
}

function cleanEnv(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const env: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue
    if (key.length > 64 || ENV_DENY_RE.test(key)) continue
    if (typeof rawValue !== 'string') continue
    env[key] = rawValue.slice(0, 2000)
    if (Object.keys(env).length >= 50) break
  }
  return env
}

function cleanAgentPayload(body: any): Partial<Agent> & { name?: string } {
  const input = body && typeof body === 'object' ? body : {}
  const payload: Partial<Agent> & { name?: string } = {}
  const name = cleanText(input.name, 200)
  if (name) payload.name = name
  const slug = cleanText(input.slug, 100)
  if (slug) payload.slug = slug
  const avatar = cleanText(input.avatar, 200)
  if (avatar) payload.avatar = avatar
  if (typeof input.runtime === 'string' && RUNTIMES.has(input.runtime)) payload.runtime = input.runtime
  const model = cleanText(input.model, 100)
  if (model) payload.model = model
  if (typeof input.status === 'string' && STATUSES.has(input.status)) payload.status = input.status
  const mcpServers = cleanStringArray(input.mcpServers, 50, 100)
  if (mcpServers) payload.mcpServers = mcpServers
  const env = cleanEnv(input.env)
  if (env) payload.env = env
  const capabilities = cleanStringArray(input.capabilities, 100, 100)
  if (capabilities) payload.capabilities = capabilities
  if (typeof input.body === 'string') payload.body = input.body.slice(0, 100000)
  return payload
}

function flatten(tasks: Task[]): Task[] {
  const out: Task[] = []
  for (const task of tasks) {
    out.push(task)
    out.push(...flatten(task.children))
  }
  return out
}

function currentAgent(req: any): Agent | null {
  const token = extractToken(req.headers.authorization)
  if (!token) return null
  const agentId = getAgentIdFromCredential(token)
  return agentId ? getAgent(agentId) : null
}

agentsRouter.post('/migrate', (_req, res) => {
  const created = ensureAgentStubsFromTasks()
  res.json({ ok: true, created })
})

agentsRouter.get('/', (_req, res) => {
  res.json(listAgents())
})

agentsRouter.post('/', (req, res) => {
  const payload = cleanAgentPayload(req.body)
  if (!payload.name) {
    res.status(400).json({ error: 'name is required' })
    return
  }
  try {
    const agent = createAgent(payload as Partial<Agent> & { name: string })
    broadcast({ type: 'agent:created', payload: { agent } })
    res.status(201).json(agent)
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

agentsRouter.get('/me', (req, res) => {
  const agent = currentAgent(req)
  if (!agent) {
    res.status(401).json({ error: 'No agent is bound to this credential' })
    return
  }
  res.json(agent)
})

agentsRouter.get('/me/tasks', (req, res) => {
  const agent = currentAgent(req)
  if (!agent) {
    res.status(401).json({ error: 'No agent is bound to this credential' })
    return
  }
  const status = (req.query.status as string | undefined)?.toLowerCase()
  const results: any[] = []
  for (const file of storage.listFiles()) {
    const { columns, tasks } = parseBoard(file.markdown, file.id)
    for (const task of flatten(tasks)) {
      if (task.metadata.builtBy !== agent.slug) continue
      if (status === 'open' && task.checked === true) continue
      if (status === 'done' && task.checked !== true) continue
      const col = columns.find((c) => flatten(c.tasks).some((t) => t.id === task.id))
      results.push({ itemId: file.id, itemName: file.name, task, column: col?.title ?? task.column })
    }
  }
  res.json({ agentId: agent.id, count: results.length, results })
})

agentsRouter.get('/:id', (req, res) => {
  const agent = getAgent(req.params.id)
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' })
    return
  }
  res.json(agent)
})

agentsRouter.patch('/:id', (req, res) => {
  const agent = updateAgent(req.params.id, cleanAgentPayload(req.body))
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' })
    return
  }
  broadcast({ type: 'agent:updated', payload: { agent } })
  res.json(agent)
})

agentsRouter.post('/me/claim', async (req, res, next) => {
  const agent = currentAgent(req)
  if (!agent) {
    res.status(401).json({ error: 'No agent is bound to this credential' })
    return
  }
  const { itemId, taskId } = req.body
  if (!isValidId(itemId) || !isValidId(taskId)) {
    res.status(400).json({ error: 'itemId and taskId are required' })
    return
  }

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(itemId)
      if (!file) return { status: 404 as const }
      const { ast, taskMap } = parseBoard(file.markdown, itemId)
      const task = taskMap.get(taskId)
      if (!task) return { status: 404 as const }
      if (task.metadata.builtBy && task.metadata.builtBy !== agent.slug && !task.checked) {
        return { status: 409 as const, error: `Task already claimed by ${task.metadata.builtBy}` }
      }
      const metadata: TaskMetadata = {
        ...task.metadata,
        builtBy: agent.slug,
        claimedAt: new Date().toISOString(),
        status: task.metadata.status ?? 'in_progress',
      }
      const newAst = updateTaskMetadata(ast, taskId, task.displayContent, metadata)
      const markdown = serializeAst(newAst)
      invalidateBoardCache(itemId)
      const saved = storage.updateFileMarkdown(itemId, markdown)
      return { status: 200 as const, file: saved }
    })
    if (result.status === 404) res.status(404).json({ error: 'Task or item not found' })
    else if (result.status === 409) res.status(409).json({ error: result.error })
    else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        broadcast({ type: 'agent:claimed', payload: { itemId, taskId, agentId: agent.id, slug: agent.slug } })
        queueEmbeddingUpdate(result.file.id, result.file.markdown, result.file.itemType)
      }
      res.json({ ok: true, agent })
    }
  } catch (err) { next(err) }
})

agentsRouter.post('/me/release', async (req, res, next) => {
  const agent = currentAgent(req)
  if (!agent) {
    res.status(401).json({ error: 'No agent is bound to this credential' })
    return
  }
  const { itemId, taskId, reason } = req.body
  if (!isValidId(itemId) || !isValidId(taskId)) {
    res.status(400).json({ error: 'itemId and taskId are required' })
    return
  }

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(itemId)
      if (!file) return { status: 404 as const }
      const { ast, taskMap } = parseBoard(file.markdown, itemId)
      const task = taskMap.get(taskId)
      if (!task) return { status: 404 as const }
      if (task.metadata.builtBy && task.metadata.builtBy !== agent.slug) {
        return { status: 409 as const, error: `Task is claimed by ${task.metadata.builtBy}` }
      }
      const metadata: TaskMetadata = { ...task.metadata, builtBy: null, claimedAt: null, status: task.metadata.status ?? null }
      const newAst = updateTaskMetadata(ast, taskId, task.displayContent, metadata)
      const markdown = serializeAst(newAst)
      invalidateBoardCache(itemId)
      const saved = storage.updateFileMarkdown(itemId, markdown)
      return { status: 200 as const, file: saved }
    })
    if (result.status === 404) res.status(404).json({ error: 'Task or item not found' })
    else if (result.status === 409) res.status(409).json({ error: result.error })
    else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        broadcast({ type: 'agent:released', payload: { itemId, taskId, agentId: agent.id, slug: agent.slug, reason } })
        queueEmbeddingUpdate(result.file.id, result.file.markdown, result.file.itemType)
      }
      res.json({ ok: true })
    }
  } catch (err) { next(err) }
})
