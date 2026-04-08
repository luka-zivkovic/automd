import { Router } from 'express'
import {
  isAuthDisabled,
  isSetupComplete,
  createAdmin,
  login,
  logout,
  getAdminInfo,
  listApiKeys,
  createApiKey,
  deleteApiKey,
} from '../auth-storage.js'
import { requireAuth, extractToken } from '../auth-middleware.js'
import { isValidName } from '../validation.js'
import { withWriteLock } from '../write-lock.js'

export const authRouter = Router()

// Status — always public
authRouter.get('/status', (_req, res) => {
  res.json({
    setupComplete: isSetupComplete(),
    authEnabled: isSetupComplete() && !isAuthDisabled(),
  })
})

// Setup — create admin (only works once)
authRouter.post('/setup', async (req, res) => {
  const { email, password } = req.body
  if (!email || typeof email !== 'string' || !/^.+@.+\..+$/.test(email.trim())) {
    res.status(400).json({ error: 'A valid email address is required.' })
    return
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' })
    return
  }

  try {
    const result = await withWriteLock(() => {
      if (isSetupComplete()) {
        return { error: 'Admin account already exists.' as const }
      }
      return createAdmin(email, password)
    })

    if ('error' in result) {
      res.status(403).json({ error: result.error })
    } else {
      res.status(201).json(result)
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create admin account.' })
  }
})

// Login
authRouter.post('/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' })
    return
  }

  const result = login(email, password)
  if (!result) {
    res.status(401).json({ error: 'Invalid email or password.' })
    return
  }

  res.json(result)
})

// Logout — requires auth
authRouter.post('/logout', requireAuth, (req, res) => {
  const token = extractToken(req.headers.authorization)
  if (token) {
    logout(token)
  }
  res.status(204).end()
})

// Me — requires auth
authRouter.get('/me', requireAuth, (req, res) => {
  const info = getAdminInfo()
  if (!info) {
    res.status(404).json({ error: 'No admin account found.' })
    return
  }
  res.json(info)
})

// List API keys — requires auth
authRouter.get('/api-keys', requireAuth, (_req, res) => {
  res.json(listApiKeys())
})

// Create API key — requires auth
authRouter.post('/api-keys', requireAuth, (req, res) => {
  const { name } = req.body
  if (!name || typeof name !== 'string' || !isValidName(name)) {
    res.status(400).json({ error: 'A valid name is required (1-200 characters).' })
    return
  }

  try {
    const result = createApiKey(name.trim())
    res.status(201).json(result)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create API key.' })
  }
})

// Delete API key — requires auth
authRouter.delete('/api-keys/:id', requireAuth, (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const deleted = deleteApiKey(id)
  if (!deleted) {
    res.status(404).json({ error: 'API key not found.' })
    return
  }
  res.status(204).end()
})
