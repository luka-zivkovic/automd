import { Router } from 'express'
import * as storage from '../storage.js'
import { parseBoard } from '../board-cache.js'
import { tokenizeForSearch, computeScore } from '@automd/shared'
import type { Task } from '@automd/shared'

export const contextRouter = Router()

interface ContextSource {
  board: string
  boardId: string
  task: string
  taskId: string
  type: 'knowledge' | 'learning' | 'task'
}

interface RelatedTask {
  title: string
  column: string
  checked: boolean | null
  labels: string[]
  board: string
  boardId: string
  taskId: string
}

interface BoardContext {
  boardName: string
  boardId: string
  description: string | null
  tags: string[]
}

/**
 * GET /api/context?topic=auth&labels=backend,security&limit=20
 *
 * Returns a structured knowledge brief from all boards.
 * Includes knowledge items, learnings, active work, and board context.
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
    const relatedTasks: RelatedTask[] = []
    const boardContextMap = new Map<string, BoardContext>()

    // Pre-tokenize the topic query for scored matching
    const topicTokens = topic ? tokenizeForSearch(topic) : []

    for (const file of files) {
      if (!file.markdown) continue
      const { columns, meta } = parseBoard(file.markdown, file.id)
      const boardTags = meta?.tags ?? []
      let boardHasMatch = false

      // Iterate columns → tasks to preserve column context
      for (const column of columns) {
        for (const task of flattenColumnTasks(column.tasks)) {
          const matchesTopic = !topic || matchesText(task, topic, topicTokens, boardTags)
          const matchesLabels = labelFilter.length === 0 ||
            labelFilter.some(l => task.metadata.labels.some(tl => tl.toLowerCase() === l)) ||
            labelFilter.some(l => boardTags.some(t => t.toLowerCase() === l))

          if (!matchesTopic && !matchesLabels) continue
          boardHasMatch = true

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

          // Related tasks: non-knowledge, non-archived, unchecked active work
          if (!task.metadata.knowledge && !task.metadata.archived && !task.checked) {
            relatedTasks.push({
              title: task.displayContent,
              column: column.title,
              checked: task.checked,
              labels: task.metadata.labels,
              board: file.name,
              boardId: file.id,
              taskId: task.id,
            })
            sources.push({
              board: file.name, boardId: file.id,
              task: task.displayContent, taskId: task.id,
              type: 'task',
            })
          }
        }
      }

      // Capture board-level context for any board with matches
      if (boardHasMatch && !boardContextMap.has(file.id)) {
        boardContextMap.set(file.id, {
          boardName: file.name,
          boardId: file.id,
          description: meta?.description ?? null,
          tags: boardTags,
        })
      }
    }

    const boardContexts = Array.from(boardContextMap.values())

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

    if (relatedTasks.length > 0) {
      sections.push('\n### Active Work')
      // Group by column
      const byColumn = new Map<string, RelatedTask[]>()
      for (const task of relatedTasks.slice(0, limit)) {
        const existing = byColumn.get(task.column) ?? []
        existing.push(task)
        byColumn.set(task.column, existing)
      }
      for (const [columnName, tasks] of byColumn) {
        sections.push(`\n**${columnName}**`)
        for (const task of tasks) {
          const labelStr = task.labels.length ? ` (${task.labels.map(l => '#' + l).join(' ')})` : ''
          const status = task.checked ? ' [done]' : ''
          sections.push(`- ${task.title}${labelStr}${status} — ${task.board}`)
        }
      }
    }

    if (boardContexts.length > 0) {
      const withDescriptions = boardContexts.filter(b => b.description || b.tags.length > 0)
      if (withDescriptions.length > 0) {
        sections.push('\n### Board Context')
        for (const board of withDescriptions) {
          const tagStr = board.tags.length ? ` (tags: ${board.tags.map(t => '#' + t).join(' ')})` : ''
          sections.push(`\n**${board.boardName}**${tagStr}`)
          if (board.description) sections.push(board.description)
        }
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
      relatedTaskCount: relatedTasks.length,
      boardContextCount: boardContexts.length,
      relatedTasks: relatedTasks.slice(0, limit),
      boardContexts,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    next(err)
  }
})

/** Flatten tasks including children, preserving iteration order */
function flattenColumnTasks(tasks: Task[]): Task[] {
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

/**
 * Scored text matching using tokenized search.
 * Falls back to substring matching when topic has no tokens after stop-word removal.
 */
function matchesText(task: Task, query: string, queryTokens: string[], boardTags: string[]): boolean {
  const searchable = [
    task.displayContent,
    task.description,
    task.acceptanceCriteria,
    task.learnings,
    ...task.metadata.labels,
    ...boardTags,
  ].filter(Boolean).join(' ')

  // If we have usable tokens, use scored matching
  if (queryTokens.length > 0) {
    const docTokens = tokenizeForSearch(searchable)
    const score = computeScore(queryTokens, docTokens)
    return score >= 0.3 // inclusive threshold for context gathering
  }

  // Fallback to substring for queries that are all stop words
  return searchable.toLowerCase().includes(query)
}
