import { Router, type Request } from 'express'
import { nanoid } from 'nanoid'
import {
  serializeAst,
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  updateAcceptanceCriteria,
  updateLearnings,
  deleteTask,
} from '@automd/shared'
import type { TaskMetadata } from '@automd/shared'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId } from '../validation.js'
import { parseBoard } from '../board-cache.js'

type FileParams = { fileId: string }
type TaskParams = { fileId: string; taskId: string }

export const tasksRouter = Router({ mergeParams: true })

function saveAndBroadcast(fileId: string, markdown: string) {
  const file = storage.updateFileMarkdown(fileId, markdown)
  if (file) {
    broadcast({ type: 'file:updated', payload: { id: file.id, markdown: file.markdown } })
  }
  return file
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

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(req.params.fileId)
      if (!file) return null

      // ETag conflict detection
      const ifMatch = req.headers['if-match']
      if (ifMatch && ifMatch !== `"${file.updatedAt}"`) {
        return { conflict: true as const, currentVersion: file.updatedAt }
      }

      const { ast } = parseBoard(file.markdown, req.params.fileId)
      const taskId = nanoid(10)
      const newAst = addTask(ast, columnId, content, taskId)
      const markdown = serializeAst(newAst)

      saveAndBroadcast(req.params.fileId, markdown)

      return { taskId, content }
    })

    if (!result) {
      res.status(404).json({ error: 'Board not found' })
    } else if ('conflict' in result) {
      res.status(409).json({
        error: 'Conflict: board was modified since your last read',
        currentVersion: result.currentVersion,
      })
    } else {
      res.status(201).json(result)
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

      const { ast } = parseBoard(file.markdown, fileId)
      let newAst = ast

      switch (action) {
        case 'toggle':
          newAst = toggleTask(ast, taskId)
          break
        case 'move':
          if (!targetColumnId || targetIndex === undefined) {
            return { status: 400 as const, error: 'targetColumnId and targetIndex required for move' }
          }
          newAst = moveTask(ast, taskId, targetColumnId, targetIndex)
          break
        case 'updateContent':
          if (!content) {
            return { status: 400 as const, error: 'content required for updateContent' }
          }
          newAst = updateTaskContent(ast, taskId, content)
          break
        case 'updateMetadata':
          if (!displayContent || !metadata) {
            return { status: 400 as const, error: 'displayContent and metadata required' }
          }
          newAst = updateTaskMetadata(ast, taskId, displayContent, metadata as TaskMetadata)
          break
        case 'updateAcceptanceCriteria':
          newAst = updateAcceptanceCriteria(ast, taskId, acceptanceCriteria ?? null)
          break
        case 'updateLearnings':
          newAst = updateLearnings(ast, taskId, learnings ?? null)
          break
        default:
          return { status: 400 as const, error: `Unknown action: ${action}` }
      }

      const markdown = serializeAst(newAst)
      saveAndBroadcast(fileId, markdown)

      return { status: 200 as const }
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

      const { ast } = parseBoard(file.markdown, fileId)
      const newAst = deleteTask(ast, taskId)
      const markdown = serializeAst(newAst)

      saveAndBroadcast(fileId, markdown)

      return { status: 204 as const }
    })

    if (result.status === 404) {
      res.status(404).json({ error: 'Board not found' })
    } else {
      res.status(204).send()
    }
  } catch (err) {
    next(err)
  }
})
