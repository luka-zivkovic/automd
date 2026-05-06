import { Router } from 'express'
import { getSkill, listSkills } from '../skill-storage.js'

export const skillsRouter = Router()

skillsRouter.get('/', (_req, res) => {
  res.json(listSkills())
})

skillsRouter.get('/:slug', (req, res) => {
  const skill = getSkill(req.params.slug)
  if (!skill) {
    res.status(404).json({ error: 'Skill not found' })
    return
  }
  res.json(skill)
})

