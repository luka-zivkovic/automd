import { Router } from 'express'
import * as storage from '../storage.js'
import { parseBoard } from '../board-cache.js'
import { semanticSearch, isEmbeddingsEnabled } from '../embeddings/index.js'
import { getRelationships } from '../relationships.js'
import type { Task } from '@automd/shared'

export const contextRouter = Router()

interface ContextSource {
  board: string
  boardId: string
  task: string
  taskId: string
  type: 'knowledge' | 'learning'
}

/**
 * GET /api/context?topic=auth&labels=backend,security&limit=20
 *
 * Returns a structured knowledge brief from all boards.
 * Designed for non-MCP users (ChatGPT, Perplexity, API-direct) to retrieve
 * paste-ready context for their AI conversations.
 */
contextRouter.get('/', (req, res, next) => {
  try {
    const topic = (req.query.topic as string | undefined)?.toLowerCase()
    const labelsParam = req.query.labels as string | undefined
    const labelFilter = labelsParam ? labelsParam.split(',').map(l => l.trim().toLowerCase()) : []
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)

    const files = storage.listFiles()
    const sources: ContextSource[] = []
    const knowledgeItems: Array<{ title: string; description?: string; learnings?: string; labels: string[]; board: string }> = []
    const learningItems: Array<{ task: string; learnings: string; labels: string[]; board: string }> = []

    for (const file of files) {
      if (!file.markdown) continue
      const { tasks, meta } = parseBoard(file.markdown, file.id)
      const boardTags = meta?.tags ?? []

      for (const task of flattenTasks(tasks)) {
        const matchesTopic = !topic || matchesText(task, topic) ||
          boardTags.some(t => t.toLowerCase().includes(topic))
        const matchesLabels = labelFilter.length === 0 ||
          labelFilter.some(l => task.metadata.labels.some(tl => tl.toLowerCase() === l)) ||
          labelFilter.some(l => boardTags.some(t => t.toLowerCase() === l))

        if (!matchesTopic && !matchesLabels) continue

        // Knowledge items (tasks with knowledge:true)
        if (task.metadata.knowledge) {
          knowledgeItems.push({
            title: task.displayContent,
            description: task.description ?? undefined,
            learnings: task.learnings ?? undefined,
            labels: task.metadata.labels,
            board: file.name,
          })
          sources.push({
            board: file.name, boardId: file.id,
            task: task.displayContent, taskId: task.id,
            type: 'knowledge',
          })
        }

        // Tasks with learnings (even if not knowledge:true)
        if (task.learnings) {
          learningItems.push({
            task: task.displayContent,
            learnings: task.learnings,
            labels: task.metadata.labels,
            board: file.name,
          })
          if (!task.metadata.knowledge) {
            sources.push({
              board: file.name, boardId: file.id,
              task: task.displayContent, taskId: task.id,
              type: 'learning',
            })
          }
        }
      }
    }

    // Build paste-ready context markdown
    const sections: string[] = []

    if (knowledgeItems.length > 0) {
      sections.push('### Knowledge')
      for (const item of knowledgeItems.slice(0, limit)) {
        sections.push(`\n**${item.title}**${item.labels.length ? ` (${item.labels.map(l => '#' + l).join(' ')})` : ''}`)
        if (item.description) sections.push(item.description)
        if (item.learnings) sections.push(`Learnings: ${item.learnings}`)
      }
    }

    if (learningItems.length > 0) {
      sections.push('\n### Learnings from Tasks')
      for (const item of learningItems.slice(0, limit)) {
        sections.push(`\n**${item.task}** (${item.board})`)
        sections.push(item.learnings)
      }
    }

    const contextText = sections.length > 0
      ? `## Knowledge from AutoMD${topic ? ` — ${topic}` : ''}\n\n${sections.join('\n')}`
      : 'No matching knowledge found.'

    res.json({
      topic: topic ?? null,
      context: contextText,
      sources: sources.slice(0, limit),
      knowledgeCount: knowledgeItems.length,
      learningCount: learningItems.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  const stack = [...tasks]
  while (stack.length > 0) {
    const task = stack.pop()!
    result.push(task)
    for (let i = task.children.length - 1; i >= 0; i--) {
      stack.push(task.children[i])
    }
  }
  return result
}

function matchesText(task: Task, query: string): boolean {
  const searchable = [
    task.displayContent,
    task.description,
    task.acceptanceCriteria,
    task.learnings,
    ...task.metadata.labels,
  ].filter(Boolean).join(' ').toLowerCase()
  return searchable.includes(query)
}

// ─── Context Assembly ─────────────────────────────────────────────────

interface ContextItem {
  itemId: string
  itemName: string
  taskId: string
  title: string
  labels: string[]
  description: string | null
  learnings: string | null
  column: string
  source: 'target' | 'relationship' | 'semantic' | 'learning'
  relationshipType?: string
}

function truncateStr(text: string | null, maxLen: number): string | null {
  if (!text) return null
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

/**
 * GET /api/context/assemble?itemId=...&taskId=...
 * GET /api/context/assemble?topic=...
 *
 * Intelligent context assembly for agents. Returns:
 * 1. The target task itself
 * 2. Related tasks via explicit relationships + semantic similarity
 * 3. Recent learnings from completed tasks
 * 4. Board-level context
 */
contextRouter.get('/assemble', async (req, res, next) => {
  try {
    const itemId = req.query.itemId as string | undefined
    const taskId = req.query.taskId as string | undefined
    const topic = req.query.topic as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 30)

    if (!topic && (!itemId || !taskId)) {
      res.status(400).json({ error: 'Provide either (itemId + taskId) or topic' })
      return
    }

    const result: {
      target: ContextItem | null
      related: ContextItem[]
      recentLearnings: ContextItem[]
      boardContext: { boardName: string; description: string | null; tags: string[] } | null
      stats: { totalItems: number; sources: Record<string, number> }
    } = {
      target: null,
      related: [],
      recentLearnings: [],
      boardContext: null,
      stats: { totalItems: 0, sources: {} },
    }

    const seenKeys = new Set<string>()

    // ─── Task-based assembly ──────────────────────────────────────
    if (itemId && taskId) {
      const file = storage.getFile(itemId)
      if (file) {
        const { columns, tasks, meta } = parseBoard(file.markdown, file.id)
        const allTasks = flattenTasks(tasks)
        const task = allTasks.find(t => t.id === taskId)

        if (task) {
          const col = columns.find(c => c.tasks.some(t => t.id === task.id))

          // 1. Target task
          result.target = {
            itemId: file.id, itemName: file.name, taskId: task.id,
            title: task.displayContent, labels: task.metadata.labels,
            description: task.description, learnings: task.learnings,
            column: col?.title ?? task.column, source: 'target',
          }
          seenKeys.add(`${file.id}:${task.id}`)

          // Board context
          result.boardContext = {
            boardName: meta?.board ?? file.name,
            description: meta?.description ?? null,
            tags: meta?.tags ?? [],
          }

          // 2. Explicit relationships
          try {
            const rels = getRelationships(itemId, taskId)
            const files = storage.listFiles()
            const fileMap = new Map(files.map(f => [f.id, f]))

            for (const rel of rels.slice(0, limit)) {
              const key = `${rel.itemId}:${rel.taskId}`
              if (seenKeys.has(key)) continue
              seenKeys.add(key)

              const relFile = fileMap.get(rel.itemId)
              if (!relFile) continue

              const { columns: relCols, tasks: relTasks } = parseBoard(relFile.markdown, relFile.id)
              const relTask = flattenTasks(relTasks).find(t => t.id === rel.taskId)
              if (!relTask) continue

              const relCol = relCols.find(c => c.tasks.some(t => t.id === relTask.id))
              result.related.push({
                itemId: relFile.id, itemName: relFile.name, taskId: relTask.id,
                title: relTask.displayContent, labels: relTask.metadata.labels,
                description: truncateStr(relTask.description, 300),
                learnings: truncateStr(relTask.learnings, 300),
                column: relCol?.title ?? relTask.column,
                source: 'relationship', relationshipType: rel.relationType,
              })
            }
          } catch {
            // Relationships may not be available
          }

          // 3. Semantic search for additional related content
          if (isEmbeddingsEnabled()) {
            const searchQuery = task.displayContent + (task.description ? ' ' + task.description.slice(0, 100) : '')
            const semanticResults = await semanticSearch(searchQuery, limit)

            for (const sr of semanticResults) {
              const key = `${sr.itemId}:${sr.taskId}`
              if (seenKeys.has(key)) continue
              seenKeys.add(key)

              const semFile = storage.getFile(sr.itemId)
              if (!semFile) continue

              const { columns: semCols, tasks: semTasks } = parseBoard(semFile.markdown, semFile.id)
              const semTask = flattenTasks(semTasks).find(t => t.id === sr.taskId)
              if (!semTask) continue

              const semCol = semCols.find(c => c.tasks.some(t => t.id === semTask.id))
              result.related.push({
                itemId: semFile.id, itemName: semFile.name, taskId: semTask.id,
                title: semTask.displayContent, labels: semTask.metadata.labels,
                description: truncateStr(semTask.description, 300),
                learnings: truncateStr(semTask.learnings, 300),
                column: semCol?.title ?? semTask.column, source: 'semantic',
              })
            }
          }

          // 4. Recent learnings from completed tasks in same board
          const learningTasks = allTasks
            .filter(t => t.id !== taskId && t.checked && t.learnings)
            .sort((a, b) => {
              const aTime = a.metadata.completedAt ? new Date(a.metadata.completedAt).getTime() : 0
              const bTime = b.metadata.completedAt ? new Date(b.metadata.completedAt).getTime() : 0
              return bTime - aTime
            })
            .slice(0, 5)

          for (const t of learningTasks) {
            const tCol = columns.find(c => c.tasks.some(ct => ct.id === t.id))
            result.recentLearnings.push({
              itemId: file.id, itemName: file.name, taskId: t.id,
              title: t.displayContent, labels: t.metadata.labels,
              description: null, learnings: truncateStr(t.learnings, 300),
              column: tCol?.title ?? t.column, source: 'learning',
            })
          }
        }
      }
    }

    // ─── Topic-based assembly ─────────────────────────────────────
    if (topic && !result.target) {
      if (isEmbeddingsEnabled()) {
        const results = await semanticSearch(topic, limit)
        const files = storage.listFiles()
        const fileMap = new Map(files.map(f => [f.id, f]))

        for (const sr of results) {
          const file = fileMap.get(sr.itemId)
          if (!file) continue

          const { columns, tasks } = parseBoard(file.markdown, file.id)
          const task = flattenTasks(tasks).find(t => t.id === sr.taskId)
          if (!task) continue

          const col = columns.find(c => c.tasks.some(t => t.id === task.id))
          result.related.push({
            itemId: file.id, itemName: file.name, taskId: task.id,
            title: task.displayContent, labels: task.metadata.labels,
            description: truncateStr(task.description, 300),
            learnings: truncateStr(task.learnings, 300),
            column: col?.title ?? task.column, source: 'semantic',
          })
        }
      }
    }

    // Slice before computing stats so counts match returned data
    result.related = result.related.slice(0, limit)

    // Compute stats
    const allItems = [
      ...(result.target ? [result.target] : []),
      ...result.related,
      ...result.recentLearnings,
    ]
    result.stats.totalItems = allItems.length
    for (const item of allItems) {
      result.stats.sources[item.source] = (result.stats.sources[item.source] ?? 0) + 1
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})
