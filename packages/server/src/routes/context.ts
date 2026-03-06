import { Router } from 'express'
import * as storage from '../storage.js'
import { parseBoard } from '../board-cache.js'
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
          boardTags.some((t: string) => t.toLowerCase().includes(topic))
        const matchesLabels = labelFilter.length === 0 ||
          labelFilter.some(l => task.metadata.labels.some(tl => tl.toLowerCase() === l)) ||
          labelFilter.some(l => boardTags.some((t: string) => t.toLowerCase() === l))

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
