import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { nanoid } from 'nanoid'
import { getAutomdDir } from './config.js'
import type {
  WebhookRegistration,
  WebhookData,
  WebhookEventType,
  WebhookTemplate,
} from './webhook-events.js'

// ─── File I/O ────────────────────────────────────────────────────────────

function getWebhooksPath(): string {
  return path.join(getAutomdDir(), 'webhooks.json')
}

function ensureDir() {
  const dir = getAutomdDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readWebhooks(): WebhookData {
  ensureDir()
  const p = getWebhooksPath()
  if (!fs.existsSync(p)) {
    return { webhooks: [] }
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      webhooks: Array.isArray(parsed.webhooks) ? parsed.webhooks : [],
    }
  } catch (err) {
    console.error('[webhooks] Failed to read webhooks.json, resetting:', err)
    return { webhooks: [] }
  }
}

function writeWebhooks(data: WebhookData) {
  ensureDir()
  const p = getWebhooksPath()
  const tmpPath = p + '.tmp'
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, p)
  } catch (err) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    throw new Error(`Failed to write webhooks.json: ${err}`)
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export function listWebhooks(): WebhookRegistration[] {
  return readWebhooks().webhooks
}

export function getWebhook(id: string): WebhookRegistration | null {
  return readWebhooks().webhooks.find((w) => w.id === id) ?? null
}

export function createWebhook(opts: {
  name: string
  url: string
  events: WebhookEventType[]
  template?: WebhookTemplate | null
}): WebhookRegistration & { plaintextSecret: string } {
  const data = readWebhooks()
  const id = nanoid(10)
  const secret = crypto.randomBytes(32).toString('hex')
  const now = Date.now()

  const webhook: WebhookRegistration = {
    id,
    name: opts.name,
    url: opts.url,
    secret,
    events: opts.events,
    enabled: true,
    template: opts.template ?? null,
    createdAt: now,
    updatedAt: now,
    stats: {
      totalDelivered: 0,
      totalFailed: 0,
      lastDeliveredAt: null,
      lastFailedAt: null,
      lastStatusCode: null,
    },
  }

  data.webhooks.push(webhook)
  writeWebhooks(data)

  return { ...webhook, plaintextSecret: secret }
}

export function updateWebhook(
  id: string,
  updates: Partial<Pick<WebhookRegistration, 'name' | 'url' | 'events' | 'enabled' | 'template'>>,
): WebhookRegistration | null {
  const data = readWebhooks()
  const idx = data.webhooks.findIndex((w) => w.id === id)
  if (idx === -1) return null

  const webhook = data.webhooks[idx]
  if (updates.name !== undefined) webhook.name = updates.name
  if (updates.url !== undefined) webhook.url = updates.url
  if (updates.events !== undefined) webhook.events = updates.events
  if (updates.enabled !== undefined) webhook.enabled = updates.enabled
  if (updates.template !== undefined) webhook.template = updates.template
  webhook.updatedAt = Date.now()

  data.webhooks[idx] = webhook
  writeWebhooks(data)
  return webhook
}

export function rotateSecret(id: string): { secret: string } | null {
  const data = readWebhooks()
  const idx = data.webhooks.findIndex((w) => w.id === id)
  if (idx === -1) return null

  const newSecret = crypto.randomBytes(32).toString('hex')
  data.webhooks[idx].secret = newSecret
  data.webhooks[idx].updatedAt = Date.now()
  writeWebhooks(data)
  return { secret: newSecret }
}

export function deleteWebhook(id: string): boolean {
  const data = readWebhooks()
  const idx = data.webhooks.findIndex((w) => w.id === id)
  if (idx === -1) return false
  data.webhooks.splice(idx, 1)
  writeWebhooks(data)
  return true
}

// ─── Stats ───────────────────────────────────────────────────────────────

let statsDirty = false
let statsFlushTimer: ReturnType<typeof setTimeout> | null = null
let pendingStats: WebhookData | null = null

export function updateWebhookStats(
  id: string,
  success: boolean,
  statusCode: number | null,
) {
  const data = pendingStats ?? readWebhooks()
  const webhook = data.webhooks.find((w) => w.id === id)
  if (!webhook) return

  if (success) {
    webhook.stats.totalDelivered++
    webhook.stats.lastDeliveredAt = Date.now()
  } else {
    webhook.stats.totalFailed++
    webhook.stats.lastFailedAt = Date.now()
  }
  webhook.stats.lastStatusCode = statusCode

  pendingStats = data
  statsDirty = true

  // Debounce writes: flush at most every 5 seconds
  if (!statsFlushTimer) {
    statsFlushTimer = setTimeout(() => {
      if (statsDirty && pendingStats) {
        try {
          // Merge stats into fresh data to avoid overwriting concurrent CRUD changes
          const freshData = readWebhooks()
          for (const pending of pendingStats.webhooks) {
            const target = freshData.webhooks.find(w => w.id === pending.id)
            if (target) {
              target.stats = pending.stats
            }
          }
          writeWebhooks(freshData)
        } catch (err) {
          console.error('[webhooks] Failed to flush stats:', err)
        }
        statsDirty = false
        pendingStats = null
      }
      statsFlushTimer = null
    }, 5000)
  }
}
