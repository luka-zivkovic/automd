import { Router } from 'express'
import { nanoid } from 'nanoid'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId, isValidName } from '../validation.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'

export const filesRouter = Router()

// List all boards
filesRouter.get('/', (req, res, next) => {
  try {
    const files = storage.listFiles()
    const includeArchived = req.query.includeArchived === 'true'
    const includeBacklog = req.query.includeBacklog === 'true'

    // Return metadata only (no full markdown) for listing
    const summary = files
      .filter((f) => {
        const { meta } = parseBoard(f.markdown, f.id)
        if (!includeArchived && meta?.archiveFor) return false
        if (!includeBacklog && meta?.backlogFor) return false
        return true
      })
      .map((f) => {
        const { columns, meta } = parseBoard(f.markdown, f.id)
        const taskCount = columns.reduce((sum, col) => sum + col.tasks.length, 0)
        return {
          id: f.id,
          name: f.name,
          projectId: f.projectId,
          taskCount,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
          archiveBoardId: f.archiveBoardId,
          backlogBoardId: f.backlogBoardId,
          isArchiveBoard: !!meta?.archiveFor,
          isBacklogBoard: !!meta?.backlogFor,
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

    const { columns, tasks, meta } = parseBoard(file.markdown, req.params.id)

    res.setHeader('ETag', `"${file.updatedAt}"`)
    res.json({
      id: file.id,
      name: file.name,
      projectId: file.projectId,
      markdown: file.markdown,
      meta,
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
  const { name, markdown, projectId, id: clientId, itemType } = req.body
  if (!name || !isValidName(name)) {
    res.status(400).json({ error: 'name is required (max 200 characters)' })
    return
  }

  try {
    const file = await withWriteLock(() => {
      const id = (clientId && typeof clientId === 'string' && clientId.length <= 30) ? clientId : nanoid(10)
      return storage.createFile(id, name, markdown, projectId, itemType)
    })

    const actor = req.body.actor || undefined
    broadcast({ type: 'file:created', payload: { id: file.id, name: file.name, actor } })
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

  const { markdown, name, actor } = req.body

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
        broadcast({ type: 'file:updated', payload: { id: file.id, markdown: file.markdown, actor } })
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

// Get or create the archive board for a given board
filesRouter.post('/:id/archive', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  try {
    const parentFile = storage.getFile(req.params.id)
    if (!parentFile) {
      res.status(404).json({ error: 'Board not found' })
      return
    }

    const result = await withWriteLock(() => {
      return storage.getOrCreateArchiveBoard(req.params.id, parentFile.name, () => nanoid(10))
    })

    // Check if this was newly created (parent didn't have archiveBoardId before)
    if (!parentFile.archiveBoardId) {
      broadcast({ type: 'file:created', payload: { id: result.id, name: result.name } })
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

// Get or create the backlog board for a given board
filesRouter.post('/:id/backlog', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid board ID format' })
    return
  }

  try {
    const parentFile = storage.getFile(req.params.id)
    if (!parentFile) {
      res.status(404).json({ error: 'Board not found' })
      return
    }

    const result = await withWriteLock(() => {
      return storage.getOrCreateBacklogBoard(req.params.id, parentFile.name, () => nanoid(10))
    })

    if (!parentFile.backlogBoardId) {
      broadcast({ type: 'file:created', payload: { id: result.id, name: result.name } })
    }

    res.json(result)
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
    const result = await withWriteLock(() => {
      const file = storage.getFile(req.params.id)
      const archiveBoardId = file?.archiveBoardId ?? null
      const backlogBoardId = file?.backlogBoardId ?? null
      // Also delete linked archive/backlog boards if they exist
      if (archiveBoardId) {
        storage.deleteFile(archiveBoardId)
        invalidateBoardCache(archiveBoardId)
      }
      if (backlogBoardId) {
        storage.deleteFile(backlogBoardId)
        invalidateBoardCache(backlogBoardId)
      }
      const ok = storage.deleteFile(req.params.id)
      return { ok, archiveBoardId, backlogBoardId }
    })

    if (!result.ok) {
      res.status(404).json({ error: 'Board not found' })
      return
    }
    invalidateBoardCache(req.params.id)
    if (result.archiveBoardId) {
      broadcast({ type: 'file:deleted', payload: { id: result.archiveBoardId } })
    }
    if (result.backlogBoardId) {
      broadcast({ type: 'file:deleted', payload: { id: result.backlogBoardId } })
    }
    broadcast({ type: 'file:deleted', payload: { id: req.params.id, actor: req.body?.actor } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
