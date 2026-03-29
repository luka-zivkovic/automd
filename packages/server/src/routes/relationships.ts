/**
 * Relationships API — manage task/knowledge connections.
 *
 * POST   /api/relationships          — create a relationship
 * GET    /api/relationships/:itemId/:taskId — get relationships for a task
 * DELETE /api/relationships/:id       — remove a relationship
 * GET    /api/relationships/stats     — relationship statistics
 */

import { Router } from 'express'
import {
  addRelationship,
  getRelationships,
  removeRelationship,
  countRelationships,
  type RelationType,
} from '../relationships.js'

export const relationshipsRouter = Router()

const VALID_TYPES: RelationType[] = ['depends-on', 'related-to', 'supersedes', 'learned-from']

relationshipsRouter.post('/', (req, res) => {
  const { sourceItemId, sourceTaskId, targetItemId, targetTaskId, relationType, createdBy } = req.body

  if (!sourceItemId || !sourceTaskId || !targetItemId || !targetTaskId || !relationType) {
    res.status(400).json({ error: 'Missing required fields: sourceItemId, sourceTaskId, targetItemId, targetTaskId, relationType' })
    return
  }

  if (!VALID_TYPES.includes(relationType)) {
    res.status(400).json({ error: `Invalid relationType. Must be one of: ${VALID_TYPES.join(', ')}` })
    return
  }

  try {
    const result = addRelationship(sourceItemId, sourceTaskId, targetItemId, targetTaskId, relationType, createdBy ?? 'user')
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

relationshipsRouter.get('/stats', (_req, res) => {
  try {
    const stats = countRelationships()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

relationshipsRouter.get('/:itemId/:taskId', (req, res) => {
  try {
    const { itemId, taskId } = req.params
    const related = getRelationships(itemId, taskId)
    res.json({ count: related.length, relationships: related })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

relationshipsRouter.delete('/:id', (req, res) => {
  try {
    const removed = removeRelationship(req.params.id)
    res.json({ removed })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})
