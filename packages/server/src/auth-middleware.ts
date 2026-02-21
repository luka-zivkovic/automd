import type { Request, Response, NextFunction } from 'express'
import { isAuthDisabled, isSetupComplete, validateCredential } from './auth-storage.js'

/**
 * Express middleware: requires authentication on protected routes.
 * - Skipped when AUTOMD_DISABLE_AUTH=true
 * - Skipped when no admin account exists yet (setup mode)
 * - Validates Bearer token (session token or API key)
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthDisabled()) {
    next()
    return
  }

  if (!isSetupComplete()) {
    next()
    return
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide Authorization: Bearer <token> header.' })
    return
  }

  const token = authHeader.slice(7)
  if (validateCredential(token)) {
    next()
    return
  }

  res.status(401).json({ error: 'Invalid or expired token.' })
}

/** Extract Bearer token from Authorization header, or null */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  return authHeader.slice(7)
}
