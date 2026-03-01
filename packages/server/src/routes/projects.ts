import { Router } from 'express'
import { nanoid } from 'nanoid'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId, isValidName } from '../validation.js'

export const projectsRouter = Router()

// List all projects
projectsRouter.get('/', (_req, res, next) => {
  try {
    res.json(storage.listProjects())
  } catch (err) {
    next(err)
  }
})

// Create a project
projectsRouter.post('/', async (req, res, next) => {
  const { name, color, id: clientId } = req.body
  if (!name || !isValidName(name)) {
    res.status(400).json({ error: 'name is required (max 200 characters)' })
    return
  }

  try {
    const project = await withWriteLock(() => {
      const id = (clientId && typeof clientId === 'string' && clientId.length <= 30) ? clientId : nanoid(10)
      return storage.createProject(id, name, color ?? '#3b82f6')
    })

    broadcast({ type: 'project:created', payload: project })
    res.status(201).json(project)
  } catch (err) {
    next(err)
  }
})

// Update a project
projectsRouter.put('/:id', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid project ID format' })
    return
  }

  const { name, color, fileIds } = req.body

  try {
    const project = await withWriteLock(() => {
      return storage.updateProject(req.params.id, { name, color, fileIds })
    })

    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    broadcast({ type: 'project:updated', payload: project })
    res.json(project)
  } catch (err) {
    next(err)
  }
})

// Delete a project
projectsRouter.delete('/:id', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid project ID format' })
    return
  }

  try {
    const deleted = await withWriteLock(() => {
      return storage.deleteProject(req.params.id)
    })

    if (!deleted) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    broadcast({ type: 'project:deleted', payload: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Move a file to a project
projectsRouter.post('/:id/files', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid project ID format' })
    return
  }

  const { fileId } = req.body
  if (!fileId || !isValidId(fileId)) {
    res.status(400).json({ error: 'Valid fileId is required' })
    return
  }

  try {
    const moved = await withWriteLock(() => {
      return storage.moveFileToProject(fileId, req.params.id)
    })

    if (!moved) {
      res.status(404).json({ error: 'File not found' })
      return
    }

    broadcast({ type: 'file:moved', payload: { fileId, projectId: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
