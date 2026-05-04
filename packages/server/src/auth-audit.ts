import fs from 'node:fs'
import path from 'node:path'
import { getAutomdDir } from './config.js'

export type AuthAuditEvent =
  | 'setup.created'
  | 'login.success'
  | 'login.failure'
  | 'logout'
  | 'api_key.created'
  | 'api_key.deleted'
  | 'setup.blocked'

export function recordAuthAudit(event: AuthAuditEvent, data: Record<string, unknown> = {}): void {
  try {
    const dir = getAutomdDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...data,
    }
    fs.appendFileSync(path.join(dir, 'auth-audit.log'), JSON.stringify(entry) + '\n', 'utf-8')
  } catch (err) {
    console.warn('[auth] Failed to write audit event:', err)
  }
}
