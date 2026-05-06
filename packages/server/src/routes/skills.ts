import { Router, type RequestHandler } from 'express'
import { extractToken } from '../auth-middleware.js'
import { isAuthDisabled, isSetupComplete, validateToken } from '../auth-storage.js'
import { getSkill, listSkills, SkillTooLargeError } from '../skill-storage.js'

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
