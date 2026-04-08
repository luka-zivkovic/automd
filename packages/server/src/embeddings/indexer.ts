/**
 * Embedding Indexer — extracts embeddable content from boards,
 * detects changes via content hashing, and manages the update queue.
 */

import crypto from 'node:crypto'
import type { Task, ItemType } from '@automd/shared'
import { parseBoard } from '../board-cache.js'
import * as storage from '../storage.js'
import type { VectorStore } from './vector-store.js'
import type { EmbeddingProvider } from './provider.js'
import type { ContentTier } from './vector-store.js'

export interface EmbeddableItem {
  id: string       // "{itemId}:{taskId}"
  itemId: string
  taskId: string
  text: string
  contentHash: string
  tier: ContentTier
}

/**
 * Classify a task into an embedding tier.
 * Returns null if the task isn't worth embedding.
 */
export function classifyTask(task: Task, itemType: ItemType): ContentTier | null {
  // Tier 1: Knowledge — always embed
  if (task.metadata.knowledge || task.learnings) return 'knowledge'

  // Tier 3: Page sections — any H2 with body text
  if (itemType === 'page') {
    if (task.description?.trim()) return 'page'
    return null
  }

  // Tier 2: Tasks with substantive content (description, AC, or 2+ labels)
  const hasDescription = !!task.description?.trim()
  const hasAC = !!task.acceptanceCriteria?.trim()
  const hasLabels = task.metadata.labels.length >= 2
  if (hasDescription || hasAC || hasLabels) return 'task'

  return null // Bare title, not worth embedding
}

/** Board-level context passed into embedding text for richer vectors. */
interface BoardContext {
  boardName: string
  boardDescription?: string
  tags?: string[]
}

/** Extract embeddable tasks from a board's markdown.
 *  Scope: tiered — knowledge items, substantive tasks, and page sections. */
export function extractEmbeddables(markdown: string, itemId: string, itemType: ItemType = 'board'): EmbeddableItem[] {
  const { columns, tasks, meta } = parseBoard(markdown, itemId)
  const items: EmbeddableItem[] = []

  // Build board context from manifest + frontmatter
  const file = storage.listFiles().find(f => f.id === itemId)
  const boardCtx: BoardContext = {
    boardName: meta?.board ?? file?.name ?? '',
    boardDescription: meta?.description,
    tags: meta?.tags,
  }

  // Build column lookup: taskId → column title
  const taskColumnMap = new Map<string, string>()
  for (const col of columns) {
    for (const t of flattenTasks(col.tasks)) {
      taskColumnMap.set(t.id, col.title)
    }
  }

  for (const task of flattenTasks(tasks)) {
    const tier = classifyTask(task, itemType)
    if (!tier) continue

    const columnTitle = taskColumnMap.get(task.id) ?? task.column
    const text = buildEmbeddingText(task, boardCtx, columnTitle, tier)
    if (!text.trim()) continue

    const id = `${itemId}:${task.id}`
    const contentHash = hashContent(text)
    items.push({ id, itemId, taskId: task.id, text, contentHash, tier })
  }

  return items
}

/** Index a board: embed changed items, remove orphans. */
export async function indexBoard(
  markdown: string,
  itemId: string,
  store: VectorStore,
  provider: EmbeddingProvider,
  itemType: ItemType = 'board',
): Promise<{ embedded: number; removed: number }> {
  const embeddables = extractEmbeddables(markdown, itemId, itemType)

  // Find items that need (re)embedding
  const toEmbed: EmbeddableItem[] = []
  for (const item of embeddables) {
    const existingHash = store.getContentHash(item.id)
    if (existingHash !== item.contentHash) {
      toEmbed.push(item)
    }
  }

  // Embed changed items in batch
  if (toEmbed.length > 0) {
    const texts = toEmbed.map((i) => i.text)
    const vectors = await provider.embed(texts)

    for (let i = 0; i < toEmbed.length; i++) {
      const item = toEmbed[i]
      store.upsert(item.id, item.itemId, item.taskId, vectors[i], item.contentHash, item.tier)
    }
  }

  // Remove orphans: embeddings that exist in store but no longer in board
  const currentIds = new Set(embeddables.map((e) => e.id))
  const storedIds = store.listIdsByItemId(itemId)
  let removed = 0
  for (const storedId of storedIds) {
    if (!currentIds.has(storedId)) {
      store.deleteById(storedId)
      removed++
    }
  }

  return { embedded: toEmbed.length, removed }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function buildEmbeddingText(task: Task, ctx: BoardContext, columnTitle: string, tier: ContentTier): string {
  const parts: string[] = []

  // Header: tier + board + column context for hierarchical awareness
  const headerParts: string[] = []
  if (tier === 'knowledge') headerParts.push('Type: Knowledge')
  else if (tier === 'page') headerParts.push('Type: Documentation')
  else headerParts.push('Type: Task')
  if (ctx.boardName) headerParts.push(`Board: ${ctx.boardName}`)
  if (columnTitle) headerParts.push(`Section: ${columnTitle}`)
  parts.push(headerParts.join(' | '))

  // Title repeated for emphasis (embedding models weight repeated content higher)
  parts.push(task.displayContent)

  // Labels as natural language for semantic matching
  const allLabels = [...task.metadata.labels, ...(ctx.tags ?? [])]
  if (allLabels.length > 0) {
    parts.push(`Topics: ${allLabels.join(', ')}`)
  }

  // Status + temporal context
  const statusParts: string[] = []
  if (task.checked !== null) {
    statusParts.push(task.checked ? 'Completed' : 'Open')
  }
  if (task.metadata.completedAt) {
    statusParts.push(`completed ${task.metadata.completedAt}`)
  }
  if (task.metadata.priority) {
    statusParts.push(`${task.metadata.priority} priority`)
  }
  if (statusParts.length > 0) parts.push(`Status: ${statusParts.join(', ')}`)

  // Board description for broader context
  if (ctx.boardDescription) parts.push(ctx.boardDescription)

  // Core content
  if (task.description) parts.push(task.description)
  if (task.acceptanceCriteria) parts.push(task.acceptanceCriteria)
  if (task.learnings) parts.push(task.learnings)

  // Repeat title at the end for embedding emphasis
  parts.push(task.displayContent)

  return parts.join('\n')
}

function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  for (const task of tasks) {
    result.push(task)
    if (task.children.length > 0) {
      result.push(...flattenTasks(task.children))
    }
  }
  return result
}
