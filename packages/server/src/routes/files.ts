import { Router } from 'express'
import { nanoid } from 'nanoid'
import {
  parseMarkdown,
  serializeAst,
  annotateIds,
  createIdCache,
  extractTasksAndColumns,
} from '@automd/shared'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'

export const filesRouter = Router()

// List all boards
filesRouter.get('/', (_req, res) => {
  const files = storage.listFiles()
  // Return metadata only (no full markdown) for listing
  const summary = files.map((f) => {
    const ast = annotateIds(parseMarkdown(f.markdown), createIdCache())
    const { columns } = extractTasksAndColumns(ast)
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
})

// Get a single board with parsed data
filesRouter.get('/:id', (req, res) => {
  const file = storage.getFile(req.params.id)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(file.markdown), cache)
  const { columns, tasks, taskMap } = extractTasksAndColumns(ast)

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
})

// Create a new board
filesRouter.post('/', (req, res) => {
  const { name, markdown, projectId } = req.body
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'name is required' })
    return
  }

  const id = nanoid(10)
  const file = storage.createFile(id, name, markdown, projectId)

  broadcast({ type: 'file:created', payload: { id: file.id, name: file.name } })
  res.status(201).json(file)
})

// Update board markdown
filesRouter.put('/:id', (req, res) => {
  const { markdown, name } = req.body

  if (name !== undefined) {
    storage.renameFile(req.params.id, name)
  }

  if (markdown !== undefined) {
    const file = storage.updateFileMarkdown(req.params.id, markdown)
    if (!file) {
      res.status(404).json({ error: 'Board not found' })
      return
    }
    broadcast({ type: 'file:updated', payload: { id: file.id, markdown: file.markdown } })
    res.json(file)
    return
  }

  const file = storage.getFile(req.params.id)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  res.json(file)
})

// Delete a board
filesRouter.delete('/:id', (req, res) => {
  const deleted = storage.deleteFile(req.params.id)
  if (!deleted) {
    res.status(404).json({ error: 'Board not found' })
    return
  }
  broadcast({ type: 'file:deleted', payload: { id: req.params.id } })
  res.status(204).send()
})
