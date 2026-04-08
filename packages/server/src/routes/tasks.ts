import { Router, type Request } from 'express'
import { nanoid } from 'nanoid'
import {
  serializeAst,
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  updateTaskDescription,
  updateAcceptanceCriteria,
  updateLearnings,
  deleteTask,
  extractTasksAndColumns,
} from '@automd/shared'
import type { TaskMetadata } from '@automd/shared'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId } from '../validation.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'
import { dispatchWebhookEvent } from '../webhook-delivery.js'
import type { WebhookEventType, TaskEventData } from '../webhook-events.js'
import { queueEmbeddingUpdate } from '../embeddings/index.js'

type FileParams = { fileId: string }
type TaskParams = { fileId: string; taskId: string }

function flattenTasks(tasks: { id: string; children: any[] }[]): { id: string; children: any[] }[] {
  const result: { id: string; children: any[] }[] = []
  const stack = [...tasks]
  while (stack.length > 0) {
    const t = stack.pop()!
    result.push(t)
    if (t.children) stack.push(...t.children)
  }
  return result
}

export const tasksRouter = Router({ mergeParams: true })

function saveFile(fileId: string, markdown: string) {
  invalidateBoardCache(fileId)
  return storage.updateFileMarkdown(fileId, markdown)
}

// List tasks in a board
tasksRouter.get('/', (req: Request<FileParams>, res, next) => {
  if (!isValidId(req.params.fileId)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  try {
    const file = storage.getFile(req.params.fileId)
    if (!file) {
      res.status(404).json({ error: 'Board not found' })
      return
    }

    const { columns, tasks } = parseBoard(file.markdown, req.params.fileId)
    res.setHeader('ETag', `"${file.updatedAt}"`)
    res.json({ columns, tasks })
  } catch (err) {
    next(err)
  }
})

// Add a task to a column
tasksRouter.post('/', async (req: Request<FileParams>, res, next) => {
  if (!isValidId(req.params.fileId)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  const { columnId, content } = req.body
  if (!columnId || !content) {
    res.status(400).json({ error: 'columnId and content are required' })
    return
  }

  if (typeof content !== 'string' || content.length > 2000) {
    res.status(400).json({ error: 'content must be a string of 2000 characters or less' })
    return
  }

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(req.params.fileId)
      if (!file) return null

      // ETag conflict detection
      const ifMatch = req.headers['if-match']
      if (ifMatch && ifMatch !== `"${file.updatedAt}"`) {
        return { conflict: true as const, currentVersion: file.updatedAt }
      }

      const { ast, columns } = parseBoard(file.markdown, req.params.fileId)
      const taskId = nanoid(10)
      const newAst = addTask(ast, columnId, content, taskId)
      const markdown = serializeAst(newAst)

      const col = columns.find((c) => c.id === columnId)
      const savedFile = saveFile(req.params.fileId, markdown)

      return {
        taskId,
        content,
        file: savedFile,
        webhookData: {
          event: 'task.created' as WebhookEventType,
          data: {
            taskId,
            boardId: req.params.fileId,
            boardName: file.name,
            taskTitle: content,
            column: col?.title ?? columnId,
            checked: null,
          } as TaskEventData,
        },
      }
    })

    if (!result) {
      res.status(404).json({ error: 'Board not found' })
    } else if ('conflict' in result) {
      res.status(409).json({
        error: 'Conflict: board was modified since your last read',
        currentVersion: result.currentVersion,
      })
    } else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        dispatchWebhookEvent(result.webhookData.event, result.webhookData.data)
        queueEmbeddingUpdate(result.file.id, result.file.markdown, result.file.itemType)
      }
      res.status(201).json({ taskId: result.taskId, content: result.content })
    }
  } catch (err) {
    next(err)
  }
})

// Update a task (toggle, move, edit content, edit metadata)
tasksRouter.patch('/:taskId', async (req: Request<TaskParams>, res, next) => {
  if (!isValidId(req.params.fileId) || !isValidId(req.params.taskId)) {
    res.status(400).json({ error: 'Invalid ID format' })
    return
  }

  const { action, content, metadata, displayContent, targetColumnId, targetIndex, acceptanceCriteria, learnings } = req.body
  const { fileId, taskId } = req.params

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(fileId)
      if (!file) return { status: 404 as const }

      // ETag conflict detection
      const ifMatch = req.headers['if-match']
      if (ifMatch && ifMatch !== `"${file.updatedAt}"`) {
        return { status: 409 as const, currentVersion: file.updatedAt }
      }

      const { ast, columns, tasks: beforeTasks, taskMap } = parseBoard(file.markdown, fileId)
      const taskBefore = taskMap.get(taskId) ?? beforeTasks.find((t) => t.id === taskId)
      const taskColumn = columns.find((c) => flattenTasks(c.tasks).some((t) => t.id === taskId))
      let newAst = ast
      let webhookEvent: WebhookEventType | null = null

      switch (action) {
        case 'toggle': {
          newAst = toggleTask(ast, taskId)
          const { tasks: parsedTasks, taskMap: parsedTaskMap } = extractTasksAndColumns(newAst)
          const toggledTask = parsedTaskMap.get(taskId) ?? parsedTasks.find(t => t.id === taskId)
          if (toggledTask) {
            const today = new Date().toISOString().slice(0, 10)
            if (toggledTask.checked) {
              try {
                newAst = updateTaskMetadata(
                  newAst, taskId, toggledTask.displayContent,
                  { ...toggledTask.metadata, completedAt: today }
                )
              } catch (metaErr) {
                console.warn(`[tasks] Failed to stamp completedAt for task ${taskId}:`, metaErr)
              }
              webhookEvent = 'task.completed'
            } else {
              try {
                if (toggledTask.metadata.completedAt) {
                  newAst = updateTaskMetadata(
                    newAst, taskId, toggledTask.displayContent,
                    { ...toggledTask.metadata, completedAt: null }
                  )
                }
              } catch (metaErr) {
                console.warn(`[tasks] Failed to clear completedAt for task ${taskId}:`, metaErr)
              }
              webhookEvent = 'task.uncompleted'
            }
          }
          break
        }
        case 'move':
          if (!targetColumnId || targetIndex === undefined) {
            return { status: 400 as const, error: 'targetColumnId and targetIndex required for move' }
          }
          newAst = moveTask(ast, taskId, targetColumnId, targetIndex)
          webhookEvent = 'task.moved'
          break
        case 'updateContent':
          if (!content) {
            return { status: 400 as const, error: 'content required for updateContent' }
          }
          if (typeof content !== 'string' || content.length > 2000) {
            return { status: 400 as const, error: 'content must be a string of 2000 characters or less' }
          }
          newAst = updateTaskContent(ast, taskId, content)
          webhookEvent = 'task.updated'
          break
        case 'updateMetadata':
          if (!displayContent || !metadata) {
            return { status: 400 as const, error: 'displayContent and metadata required' }
          }
          // Validate metadata structure
          if (typeof metadata !== 'object' || Array.isArray(metadata)) {
            return { status: 400 as const, error: 'metadata must be an object' }
          }
          if (metadata.priority !== undefined && metadata.priority !== null &&
              !['high', 'medium', 'low'].includes(metadata.priority)) {
            return { status: 400 as const, error: 'priority must be high, medium, or low' }
          }
          if (metadata.assignees !== undefined && !Array.isArray(metadata.assignees)) {
            return { status: 400 as const, error: 'assignees must be an array' }
          }
          if (metadata.labels !== undefined && !Array.isArray(metadata.labels)) {
            return { status: 400 as const, error: 'labels must be an array' }
          }
          if (metadata.dueDate !== undefined && metadata.dueDate !== null &&
              (typeof metadata.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(metadata.dueDate))) {
            return { status: 400 as const, error: 'dueDate must be YYYY-MM-DD format' }
          }
          if (metadata.estimate !== undefined && metadata.estimate !== null &&
              (typeof metadata.estimate !== 'number' || metadata.estimate < 0 || metadata.estimate > 9999)) {
            return { status: 400 as const, error: 'estimate must be a number between 0 and 9999' }
          }
          newAst = updateTaskMetadata(ast, taskId, displayContent, metadata as TaskMetadata)
          webhookEvent = 'task.updated'
          break
        case 'updateAcceptanceCriteria':
          if (acceptanceCriteria !== undefined && acceptanceCriteria !== null && typeof acceptanceCriteria !== 'string') {
            return { status: 400 as const, error: 'acceptanceCriteria must be a string or null' }
          }
          newAst = updateAcceptanceCriteria(ast, taskId, acceptanceCriteria ?? null)
          webhookEvent = 'task.updated'
          break
        case 'updateLearnings':
          if (learnings !== undefined && learnings !== null && typeof learnings !== 'string') {
            return { status: 400 as const, error: 'learnings must be a string or null' }
          }
          newAst = updateLearnings(ast, taskId, learnings ?? null)
          webhookEvent = 'task.updated'
          break
        case 'updateDescription':
          newAst = updateTaskDescription(ast, taskId, req.body.description ?? null)
          webhookEvent = 'task.updated'
          break
        default:
          return { status: 400 as const, error: `Unknown action: ${action}` }
      }

      const markdown = serializeAst(newAst)

      // Build webhook data for the task event
      const targetCol = action === 'move'
        ? columns.find((c) => c.id === targetColumnId)
        : taskColumn
      const whData: TaskEventData | undefined = webhookEvent ? {
        taskId,
        boardId: fileId,
        boardName: file.name,
        taskTitle: taskBefore?.displayContent ?? content ?? '',
        column: targetCol?.title ?? '',
        checked: webhookEvent === 'task.completed' ? true : webhookEvent === 'task.uncompleted' ? false : null,
        ...(action === 'move' && taskColumn ? { previousColumn: taskColumn.title } : {}),
        ...(action !== 'toggle' && action !== 'move' ? { action } : {}),
      } : undefined

      const savedFile = saveFile(fileId, markdown)

      return {
        status: 200 as const,
        file: savedFile,
        webhookData: webhookEvent && whData ? { event: webhookEvent, data: whData } : undefined,
      }
    })

    if (result.status === 404) {
      res.status(404).json({ error: 'Board not found' })
    } else if (result.status === 400) {
      res.status(400).json({ error: result.error })
    } else if (result.status === 409) {
      res.status(409).json({
        error: 'Conflict: board was modified since your last read',
        currentVersion: result.currentVersion,
      })
    } else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        if (result.webhookData) {
          dispatchWebhookEvent(result.webhookData.event, result.webhookData.data)
        }
        queueEmbeddingUpdate(result.file.id, result.file.markdown, result.file.itemType)
      }
      res.json({ ok: true })
    }
  } catch (err) {
    next(err)
  }
})

// Delete a task
tasksRouter.delete('/:taskId', async (req: Request<TaskParams>, res, next) => {
  if (!isValidId(req.params.fileId) || !isValidId(req.params.taskId)) {
    res.status(400).json({ error: 'Invalid ID format' })
    return
  }

  const { fileId, taskId } = req.params

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(fileId)
      if (!file) return { status: 404 as const }

      const { ast, columns, tasks: beforeTasks, taskMap } = parseBoard(file.markdown, fileId)
      const taskBefore = taskMap.get(taskId) ?? beforeTasks.find((t) => t.id === taskId)
      const taskColumn = columns.find((c) => flattenTasks(c.tasks).some((t) => t.id === taskId))
      const newAst = deleteTask(ast, taskId)
      const markdown = serializeAst(newAst)

      const savedFile = saveFile(fileId, markdown)

      return {
        status: 204 as const,
        file: savedFile,
        webhookData: {
          event: 'task.deleted' as WebhookEventType,
          data: {
            taskId,
            boardId: fileId,
            boardName: file.name,
            taskTitle: taskBefore?.displayContent ?? '',
            column: taskColumn?.title ?? '',
            checked: taskBefore?.checked ?? null,
          } as TaskEventData,
        },
      }
    })

    if (result.status === 404) {
      res.status(404).json({ error: 'Board not found' })
    } else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        dispatchWebhookEvent(result.webhookData.event, result.webhookData.data)
        queueEmbeddingUpdate(result.file.id, result.file.markdown, result.file.itemType)
      }
      res.status(204).send()
    }
  } catch (err) {
    next(err)
  }
})
