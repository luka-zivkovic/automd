import { Router } from 'express'
import * as storage from '../storage.js'
import { getMergedTags, invalidateTagCache } from '../tag-registry.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'

export const tagsRouter = Router()

// Get merged tags (instance + project + used)
tagsRouter.get('/', (req, res, next) => {
  try {
    const projectId = req.query.projectId as string | undefined
    const result = getMergedTags(projectId || undefined)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// Update instance-level curated tags
tagsRouter.put('/', async (req, res, next) => {
  const { tags } = req.body
  if (!Array.isArray(tags) || !tags.every((t: unknown) => typeof t === 'string')) {
    res.status(400).json({ error: 'tags must be an array of strings' })
    return
  }

  try {
    const updated = await withWriteLock(() => {
      invalidateTagCache()
      return storage.setInstanceTags(tags)
    })

    broadcast({ type: 'tags:updated', payload: { tags: updated } })
    res.json({ tags: updated })
  } catch (err) {
    next(err)
  }
})
