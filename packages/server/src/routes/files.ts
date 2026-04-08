import { Router } from 'express'
import { nanoid } from 'nanoid'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId, isValidName } from '../validation.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'
import { dispatchWebhookEvent } from '../webhook-delivery.js'
import { queueEmbeddingUpdate, removeEmbeddings } from '../embeddings/index.js'
import type { Column, Task } from '@automd/shared'

export const filesRouter = Router()

type DetailLevel = 'L0' | 'L1' | 'L2'

function parseDetailLevel(value: unknown): DetailLevel {
  if (value === 'L0' || value === 'L1') return value
  return 'L2' // default for backward compat
}

function computeProgress(columns: Column[]): number {
  let checkable = 0
  let checked = 0
  for (const col of columns) {
    for (const task of col.tasks) {
      if (task.checked !== null) {
        checkable++
        if (task.checked) checked++
      }
    }
  }
  return checkable > 0 ? Math.round((checked / checkable) * 100) : 0
}

function columnSummary(col: Column) {
  let checkedCount = 0
  for (const task of col.tasks) {
    if (task.checked) checkedCount++
  }
  return {
    id: col.id,
    title: col.title,
    taskCount: col.tasks.length,
    checkedCount,
  }
}

function stripTaskForL1(task: Task) {
  return {
    id: task.id,
    displayContent: task.displayContent,
    checked: task.checked,
    metadata: task.metadata,
  }
}

// List all boards (enriched with column summaries and progress)
filesRouter.get('/', (_req, res, next) => {
  try {
    const files = storage.listFiles()
    const summary = files.map((f) => {
      const { columns, meta } = parseBoard(f.markdown, f.id)
      const taskCount = columns.reduce((sum, col) => sum + col.tasks.length, 0)
      return {
        id: f.id,
        name: f.name,
        projectId: f.projectId,
        itemType: f.itemType,
        taskCount,
        progress: computeProgress(columns),
        tags: meta?.tags ?? [],
        columns: columns.map(columnSummary),
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
// Supports ?detail=L0|L1|L2 (default L2 for backward compat)
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

    const detail = parseDetailLevel(req.query.detail)
    const { columns, tasks, meta } = parseBoard(file.markdown, req.params.id)

    res.setHeader('ETag', `"${file.updatedAt}"`)

    if (detail === 'L0') {
      // Summary only — no individual tasks, no markdown
      res.json({
        id: file.id,
        name: file.name,
        projectId: file.projectId,
        itemType: file.itemType,
        meta,
        columns: columns.map(columnSummary),
        taskCount: tasks.length,
        progress: computeProgress(columns),
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })
    } else if (detail === 'L1') {
      // Tasks with metadata but no descriptions/AC/learnings/children/markdown
      res.json({
        id: file.id,
        name: file.name,
        projectId: file.projectId,
        itemType: file.itemType,
        meta,
        columns: columns.map(col => ({
          ...columnSummary(col),
          tasks: col.tasks.map(stripTaskForL1),
        })),
        taskCount: tasks.length,
        progress: computeProgress(columns),
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })
    } else {
      // L2: Full response (current behavior)
      res.json({
        id: file.id,
        name: file.name,
        projectId: file.projectId,
        itemType: file.itemType,
        markdown: file.markdown,
        meta,
        columns,
        tasks,
        taskCount: tasks.length,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })
    }
  } catch (err) {
    next(err)
  }
})

// Create a new board
filesRouter.post('/', async (req, res, next) => {
  const { name, markdown, projectId, itemType, id: clientId } = req.body
  if (!name || !isValidName(name)) {
    res.status(400).json({ error: 'name is required (max 200 characters)' })
    return
  }
  if (clientId !== undefined && !isValidId(clientId)) {
    res.status(400).json({ error: 'Invalid id format' })
    return
  }

  try {
    const file = await withWriteLock(() => {
      const id = clientId || nanoid(10)
      return storage.createFile(id, name, markdown, projectId, itemType)
    })

    const actor = req.body.actor || undefined
    broadcast({ type: 'file:created', payload: { id: file.id, name: file.name, actor } })
    dispatchWebhookEvent('board.created', { boardId: file.id, boardName: file.name })
    res.status(201).json(file)
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      res.status(409).json({ error: 'A file with this ID already exists' })
      return
    }
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
        dispatchWebhookEvent('board.updated', { boardId: file.id, boardName: file.name })
        queueEmbeddingUpdate(req.params.id, markdown, file.itemType)
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
    // Capture name before deletion for webhook payload
    const fileBeforeDelete = storage.getFile(req.params.id)
    const deleted = await withWriteLock(() => {
      return storage.deleteFile(req.params.id)
    })

    if (!deleted) {
      res.status(404).json({ error: 'Board not found' })
      return
    }
    invalidateBoardCache(req.params.id)
    removeEmbeddings(req.params.id)
    broadcast({ type: 'file:deleted', payload: { id: req.params.id, actor: req.body?.actor } })
    dispatchWebhookEvent('board.deleted', {
      boardId: req.params.id,
      boardName: fileBeforeDelete?.name ?? '',
    })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})
