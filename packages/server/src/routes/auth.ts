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

// Simple in-memory rate limiter for auth endpoints
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const RATE_LIMIT_MAX = 10 // max attempts per window

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

// Clean up stale entries periodically
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(ip)
  }
}, 5 * 60 * 1000) // every 5 minutes
rateLimitCleanupInterval.unref()

/** Reset rate limiter state (for tests) */
export function resetRateLimiter(): void {
  loginAttempts.clear()
}

// Status — always public
authRouter.get('/status', (_req, res) => {
  res.json({
    setupComplete: isSetupComplete(),
    authEnabled: isSetupComplete() && !isAuthDisabled(),
  })
})

// Setup — create admin (only works once)
authRouter.post('/setup', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' })
    return
  }
  const { email, password } = req.body
  if (!email || typeof email !== 'string' || !/^.+@.+\..+$/.test(email.trim())) {
    res.status(400).json({ error: 'A valid email address is required.' })
    return
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    res.status(400).json({ error: 'Password must be between 8 and 1024 characters.' })
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
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown'
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({ error: 'Too many login attempts. Please try again later.' })
    return
  }
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' })
    return
  }
  if (typeof password !== 'string' || password.length > 1024) {
    res.status(400).json({ error: 'Invalid credentials.' })
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
