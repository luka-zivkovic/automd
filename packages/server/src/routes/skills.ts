import { Router, type RequestHandler } from 'express'
import { extractToken } from '../auth-middleware.js'
import { isAuthDisabled, isSetupComplete, validateToken } from '../auth-storage.js'
import {
  getSkill,
  InvalidSkillError,
  listSkills,
  SkillExistsError,
  SkillTooLargeError,
} from '../skill-storage.js'
import {
  importSkillFromGithubUrl,
  SkillImportFetchError,
  SkillImportTooLargeError,
  SkillImportUrlError,
} from '../skill-importer.js'

export const skillsRouter = Router()

const requireSessionCredential: RequestHandler = (req, res, next) => {
  if (isAuthDisabled() || !isSetupComplete()) {
    next()
    return
  }
  const token = extractToken(req.headers.authorization)
  if (token && validateToken(token)) {
    next()
    return
  }
  res.status(403).json({ error: 'Admin session required' })
}

skillsRouter.use(requireSessionCredential)

skillsRouter.get('/', (_req, res) => {
  res.json(listSkills())
})

skillsRouter.post('/import', async (req, res, next) => {
  try {
    const sourceUrl = typeof req.body?.sourceUrl === 'string'
      ? req.body.sourceUrl.trim()
      : typeof req.body?.url === 'string'
        ? req.body.url.trim()
        : ''
    const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : undefined
    const overwrite = req.body?.overwrite === true

    if (!sourceUrl) {
      res.status(400).json({ error: 'sourceUrl is required' })
      return
    }

    const result = await importSkillFromGithubUrl(sourceUrl, { slug, overwrite })
    res.status(result.created ? 201 : 200).json(result)
  } catch (err) {
    if (err instanceof SkillImportUrlError || err instanceof InvalidSkillError) {
      res.status(400).json({ error: err.message })
      return
    }
    if (err instanceof SkillExistsError) {
      res.status(409).json({ error: err.message, slug: err.slug })
      return
    }
    if (err instanceof SkillImportTooLargeError) {
      res.status(413).json({ error: err.message, maxBytes: err.maxBytes })
      return
    }
    if (err instanceof SkillTooLargeError) {
      res.status(413).json({ error: err.message, maxBytes: err.maxBytes })
      return
    }
    if (err instanceof SkillImportFetchError) {
      res.status(err.status === 404 ? 404 : 502).json({ error: err.message, status: err.status })
      return
    }
    next(err)
  }
})

skillsRouter.get('/:slug', (req, res, next) => {
  try {
    const skill = getSkill(req.params.slug)
    if (!skill) {
      res.status(404).json({ error: 'Skill not found' })
      return
    }
    res.json(skill)
  } catch (err) {
    if (err instanceof SkillTooLargeError) {
      res.status(413).json({ error: err.message, maxBytes: err.maxBytes })
      return
    }
    next(err)
  }
})
