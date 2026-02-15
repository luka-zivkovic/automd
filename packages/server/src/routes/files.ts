import { Router } from 'express'
import { nanoid } from 'nanoid'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId, isValidName } from '../validation.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'

export const filesRouter = Router()

// List all boards
filesRouter.get('/', (_req, res, next) => {
  try {
    const files = storage.listFiles()
    // Return metadata only (no full markdown) for listing
    const summary = files.map((f) => {
      const { columns } = parseBoard(f.markdown, f.id)
      const taskCount = columns.reduce((sum, col) => sum + col.tasks.length, 0)
      return {
        id: f.id,
        name: f.name,
        projectId: f.projectId,
        taskCount,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }
    })
    res.json(summary)
  } catch (err) {
    next(err)
  }
})

// Get a single board with parsed data
filesRouter.get('/:id', (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  try {
    const file = storage.getFile(req.params.id)
    if (!file) {
      res.status(404).json({ error: 'Board not found' })
      return
    }

    const { columns, tasks } = parseBoard(file.markdown, req.params.id)

    res.setHeader('ETag', `"${file.updatedAt}"`)
    res.json({
      id: file.id,
      name: file.name,
      projectId: file.projectId,
      markdown: file.markdown,
      columns,
      tasks,
      taskCount: tasks.length,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    })
  } catch (err) {
    next(err)
  }
})

// Create a new board
filesRouter.post('/', async (req, res, next) => {
  const { name, markdown, projectId } = req.body
  if (!name || !isValidName(name)) {
    res.status(400).json({ error: 'name is required (max 200 characters)' })
    return
  }

  try {
    const file = await withWriteLock(() => {
      const id = nanoid(10)
      return storage.createFile(id, name, markdown, projectId)
    })

    broadcast({ type: 'file:created', payload: { id: file.id, name: file.name } })
    res.status(201).json(file)
  } catch (err) {
    next(err)
  }
})

// Update board markdown
filesRouter.put('/:id', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  const { markdown, name } = req.body

  try {
    const result = await withWriteLock(() => {
      // ETag conflict detection
      const ifMatch = req.headers['if-match']
      if (ifMatch) {
        const currentFile = storage.getFile(req.params.id)
        if (!currentFile) return { status: 404 as const }
        if (ifMatch !== `"${currentFile.updatedAt}"`) {
          return { status: 409 as const, currentVersion: currentFile.updatedAt }
        }
      }

      if (name !== undefined) {
        storage.renameFile(req.params.id, name)
      }

      if (markdown !== undefined) {
        invalidateBoardCache(req.params.id)
        const file = storage.updateFileMarkdown(req.params.id, markdown)
        if (!file) return { status: 404 as const }
        broadcast({ type: 'file:updated', payload: { id: file.id, markdown: file.markdown } })
        return { status: 200 as const, file }
      }

      const file = storage.getFile(req.params.id)
      if (!file) return { status: 404 as const }
      return { status: 200 as const, file }
    })

    if (result.status === 404) {
      res.status(404).json({ error: 'Board not found' })
    } else if (result.status === 409) {
      res.status(409).json({
        error: 'Conflict: board was modified since your last read',
        currentVersion: result.currentVersion,
      })
    } else {
      res.setHeader('ETag', `"${result.file.updatedAt}"`)
      res.json(result.file)
    }
  } catch (err) {
    next(err)
  }
})

// Delete a board
filesRouter.delete('/:id', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  try {
    const deleted = await withWriteLock(() => {
      return storage.deleteFile(req.params.id)
    })

    if (!deleted) {
      res.status(404).json({ error: 'Board not found' })
      return
    }
    invalidateBoardCache(req.params.id)
    broadcast({ type: 'file:deleted', payload: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
