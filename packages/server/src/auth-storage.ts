import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { nanoid } from 'nanoid'
import { getAutomdDir } from './config.js'

// ─── Types ──────────────────────────────────────────────────────────────

interface Admin {
  email: string
  passwordHash: string
  salt: string
  createdAt: number
}

interface Session {
  token: string
  createdAt: number
  expiresAt: number
}

interface ApiKeyEntry {
  id: string
  name: string
  keyHash: string
  keyPrefix: string
  createdAt: number
}

interface AuthData {
  admin: Admin | null
  sessions: Session[]
  apiKeys: ApiKeyEntry[]
}

export type { ApiKeyEntry }

// ─── Constants ──────────────────────────────────────────────────────────

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ─── File I/O ───────────────────────────────────────────────────────────

function getAuthPath(): string {
  return path.join(getAutomdDir(), 'auth.json')
}

function ensureDir() {
  const dir = getAutomdDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function readAuth(): AuthData {
  ensureDir()
  const authPath = getAuthPath()
  if (!fs.existsSync(authPath)) {
    return { admin: null, sessions: [], apiKeys: [] }
  }
  try {
    const raw = fs.readFileSync(authPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      admin: parsed.admin ?? null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
    }
  } catch (err) {
    console.error('[auth] Failed to read auth.json, resetting:', err)
    return { admin: null, sessions: [], apiKeys: [] }
  }
}

function writeAuth(data: AuthData) {
  ensureDir()
  const authPath = getAuthPath()
  const tmpPath = authPath + '.tmp'
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, authPath)
  } catch (err) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    throw new Error(`Failed to write auth.json: ${err}`)
  }
}

// ─── Hashing ────────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex')
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// ─── Status Checks ──────────────────────────────────────────────────────

export function isSetupComplete(): boolean {
  return readAuth().admin !== null
}

export function isAuthDisabled(): boolean {
  return process.env.AUTOMD_DISABLE_AUTH === 'true'
}

// ─── Admin Setup ────────────────────────────────────────────────────────

export function createAdmin(email: string, password: string): { token: string; expiresAt: number } {
  const auth = readAuth()
  if (auth.admin) {
    throw new Error('Admin already exists')
  }

  const salt = generateSalt()
  auth.admin = {
    email: email.toLowerCase().trim(),
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: Date.now(),
  }

  // Auto-login: create a session
  const token = generateToken()
  const now = Date.now()
  const expiresAt = now + SESSION_TTL_MS
  auth.sessions.push({ token, createdAt: now, expiresAt })

  writeAuth(auth)
  return { token, expiresAt }
}

// ─── Login / Logout ─────────────────────────────────────────────────────

export function login(email: string, password: string): { token: string; expiresAt: number } | null {
  const auth = readAuth()
  if (!auth.admin) return null

  if (auth.admin.email !== email.toLowerCase().trim()) return null

  const hash = hashPassword(password, auth.admin.salt)
  if (hash !== auth.admin.passwordHash) return null

  // Clean expired sessions while we're here
  const now = Date.now()
  auth.sessions = auth.sessions.filter((s) => s.expiresAt > now)

  const token = generateToken()
  const expiresAt = now + SESSION_TTL_MS
  auth.sessions.push({ token, createdAt: now, expiresAt })

  writeAuth(auth)
  return { token, expiresAt }
}

export function logout(token: string): void {
  const auth = readAuth()
  auth.sessions = auth.sessions.filter((s) => s.token !== token)
  writeAuth(auth)
}

export function getAdminInfo(): { email: string; createdAt: number } | null {
  const auth = readAuth()
  if (!auth.admin) return null
  return { email: auth.admin.email, createdAt: auth.admin.createdAt }
}

// ─── Token Validation ───────────────────────────────────────────────────

export function validateToken(token: string): boolean {
  if (!token) return false
  const auth = readAuth()
  const now = Date.now()
  const session = auth.sessions.find((s) => s.token === token && s.expiresAt > now)
  return !!session
}

export function validateApiKey(key: string): boolean {
  if (!key) return false
  const auth = readAuth()
  const keyHash = hashApiKey(key)
  return auth.apiKeys.some((k) => k.keyHash === keyHash)
}

/** Validate either a session token or API key */
export function validateCredential(credential: string): boolean {
  return validateToken(credential) || validateApiKey(credential)
}

// ─── API Key Management ─────────────────────────────────────────────────

export function createApiKey(name: string): { id: string; name: string; keyPrefix: string; fullKey: string; createdAt: number } {
  const auth = readAuth()
  const id = nanoid(10)
  const rawKey = crypto.randomBytes(24).toString('hex')
  const fullKey = `amd_${rawKey}`
  const keyHash = hashApiKey(fullKey)
  const keyPrefix = fullKey.slice(0, 12) // "amd_" + first 8 hex chars

  const entry: ApiKeyEntry = { id, name, keyHash, keyPrefix, createdAt: Date.now() }
  auth.apiKeys.push(entry)
  writeAuth(auth)

  return { id, name, keyPrefix, fullKey, createdAt: entry.createdAt }
}

export function listApiKeys(): Array<{ id: string; name: string; keyPrefix: string; createdAt: number }> {
  const auth = readAuth()
  return auth.apiKeys.map(({ id, name, keyPrefix, createdAt }) => ({ id, name, keyPrefix, createdAt }))
}

export function deleteApiKey(id: string): boolean {
  const auth = readAuth()
  const idx = auth.apiKeys.findIndex((k) => k.id === id)
  if (idx === -1) return false
  auth.apiKeys.splice(idx, 1)
  writeAuth(auth)
  return true
}
