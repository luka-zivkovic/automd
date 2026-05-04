import { Router } from 'express'
import type { Task } from '@automd/shared'
import * as storage from '../storage.js'
import { parseBoard } from '../board-cache.js'
import { listCommentsFromAst } from './comments.js'
import { extractToken } from '../auth-middleware.js'
import { getAgentIdFromCredential, getIdentityFromCredential } from '../auth-storage.js'
import { getAgent } from '../agent-storage.js'

export const inboxRouter = Router()

function flatten(tasks: Task[]): Task[] {
  const out: Task[] = []
  for (const task of tasks) {
    out.push(task)
    out.push(...flatten(task.children))
  }
  return out
}

function normalizeIdentity(value: string | null | undefined): string | null {
  const normalized = (value ?? '')
    .replace(/^api:/, '')
    .split('@')[0]
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return normalized || null
}

function identityFromRequest(req: { headers: { authorization?: string }, query: Record<string, unknown> }): string | null {
  const queryTarget = typeof req.query.target === 'string' ? normalizeIdentity(req.query.target) : null
  if (queryTarget) return queryTarget

  const token = extractToken(req.headers.authorization)
  if (!token) return null
  const agentId = getAgentIdFromCredential(token)
  if (agentId) {
    const agent = getAgent(agentId)
    if (agent) return normalizeIdentity(agent.slug)
  }
  return normalizeIdentity(getIdentityFromCredential(token))
}

function includesIdentity(values: string[], target: string): boolean {
  return values.some((value) => normalizeIdentity(value) === target)
}

function taskMatchesTarget(task: Task, target: string | null): boolean {
  if (!target) return true
  return normalizeIdentity(task.metadata.builtBy) === target || includesIdentity(task.metadata.assignees, target)
}

function itemTime(createdAt: string | undefined, fallback: number): number {
  if (!createdAt) return fallback
  const time = new Date(createdAt).getTime()
  return Number.isNaN(time) ? fallback : time
}

inboxRouter.get('/', (req, res, next) => {
  try {
    const showAll = req.query.all === 'true'
    const target = showAll ? null : identityFromRequest(req)
    const limit = Math.max(1, Math.min(Number(req.query.limit ?? 100) || 100, 250))
    const items: any[] = []

    for (const file of storage.listFiles()) {
      const { ast, columns, tasks } = parseBoard(file.markdown, file.id)
      for (const task of flatten(tasks)) {
        const column = columns.find((c) => flatten(c.tasks).some((candidate) => candidate.id === task.id))
        const comments = listCommentsFromAst(ast, task.id)
        for (const comment of comments) {
          if (comment.mentions.length === 0) continue
          if (target && !includesIdentity(comment.mentions, target)) continue
          items.push({
            id: `mention:${file.id}:${task.id}:${comment.id}`,
            type: 'mention',
            itemId: file.id,
            itemName: file.name,
            taskId: task.id,
            taskTitle: task.displayContent,
            column: column?.title ?? task.column,
            createdAt: comment.createdAt,
            timestamp: itemTime(comment.createdAt, file.updatedAt),
            author: comment.author,
            body: comment.body,
            mentions: comment.mentions,
          })
        }

        const labels = task.metadata.labels.map((label) => label.toLowerCase())
        if (labels.includes('help-wanted') && task.checked !== true && taskMatchesTarget(task, target)) {
          items.push({
            id: `help:${file.id}:${task.id}`,
            type: 'help_wanted',
            itemId: file.id,
            itemName: file.name,
            taskId: task.id,
            taskTitle: task.displayContent,
            column: column?.title ?? task.column,
            timestamp: file.updatedAt,
            labels: task.metadata.labels,
            agentSlug: task.metadata.builtBy,
          })
        }

        if (task.metadata.status === 'blocked' && task.checked !== true && taskMatchesTarget(task, target)) {
          items.push({
            id: `blocked:${file.id}:${task.id}`,
            type: 'blocked',
            itemId: file.id,
            itemName: file.name,
            taskId: task.id,
            taskTitle: task.displayContent,
            column: column?.title ?? task.column,
            timestamp: file.updatedAt,
            agentSlug: task.metadata.builtBy,
          })
        }
      }
    }

    items.sort((a, b) => b.timestamp - a.timestamp)
    res.json({ target, count: items.length, items: items.slice(0, limit) })
  } catch (err) {
    next(err)
  }
})
