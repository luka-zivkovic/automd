import { Router } from 'express'
import { nanoid } from 'nanoid'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'

export const projectsRouter = Router()

// List all projects
projectsRouter.get('/', (_req, res) => {
  res.json(storage.listProjects())
})

// Create a project
projectsRouter.post('/', (req, res) => {
  const { name, color } = req.body
  if (!name) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  const id = nanoid(10)
  const project = storage.createProject(id, name, color ?? '#3b82f6')

  broadcast({ type: 'project:created', payload: project })
  res.status(201).json(project)
})

// Update a project
projectsRouter.put('/:id', (req, res) => {
  const { name, color, fileIds } = req.body
  const project = storage.updateProject(req.params.id, { name, color, fileIds })

  if (!project) {
    res.status(404).json({ error: 'Project not found' })
    return
  }

  broadcast({ type: 'project:updated', payload: project })
  res.json(project)
})

// Delete a project
projectsRouter.delete('/:id', (req, res) => {
  const deleted = storage.deleteProject(req.params.id)
  if (!deleted) {
    res.status(404).json({ error: 'Project not found' })
    return
  }

  broadcast({ type: 'project:deleted', payload: { id: req.params.id } })
  res.status(204).send()
})

// Move a file to a project
projectsRouter.post('/:id/files', (req, res) => {
  const { fileId } = req.body
  if (!fileId) {
    res.status(400).json({ error: 'fileId is required' })
    return
  }

  const moved = storage.moveFileToProject(fileId, req.params.id)
  if (!moved) {
    res.status(404).json({ error: 'File not found' })
    return
  }

  broadcast({ type: 'file:moved', payload: { fileId, projectId: req.params.id } })
  res.json({ ok: true })
})
