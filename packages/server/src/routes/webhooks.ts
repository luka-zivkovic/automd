import { Router } from 'express'
import { isValidId, isValidName } from '../validation.js'
import {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  rotateSecret,
} from '../webhook-storage.js'
import { sendTestPing } from '../webhook-delivery.js'
import { ALL_WEBHOOK_EVENT_TYPES, type WebhookEventType } from '../webhook-events.js'

export const webhooksRouter = Router()

// ─── Validation helpers ──────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false

    // Block internal/private network addresses
    const hostname = parsed.hostname.toLowerCase()

    // Block localhost variants
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return false
    }

    // Block private IP ranges and link-local
    // IPv4: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number)
      if (a === 10) return false                          // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return false   // 172.16.0.0/12
      if (a === 192 && b === 168) return false             // 192.168.0.0/16
      if (a === 169 && b === 254) return false             // 169.254.0.0/16 (link-local)
      if (a === 127) return false                          // 127.0.0.0/8
      if (a === 0) return false                            // 0.0.0.0/8
    }

    // Block IPv6 private ranges
    if (hostname.startsWith('[') || hostname.includes(':')) {
      return false  // Block all IPv6 for simplicity — webhook targets should use DNS names
    }

    return true
  } catch {
    return false
  }
}

function isValidEvents(events: unknown): events is WebhookEventType[] {
  if (!Array.isArray(events) || events.length === 0) return false
  return events.every((e) => ALL_WEBHOOK_EVENT_TYPES.includes(e as WebhookEventType))
}

function isValidTemplate(template: unknown): boolean {
  return template === null || template === undefined || template === 'slack' || template === 'discord'
}

// ─── Routes ──────────────────────────────────────────────────────────────

// List all webhooks (secrets redacted)
webhooksRouter.get('/', (_req, res, next) => {
  try {
    const webhooks = listWebhooks().map((wh) => ({
      ...wh,
      secret: wh.secret.slice(0, 8) + '...',
    }))
    res.json(webhooks)
  } catch (err) {
    next(err)
  }
})

// Get a single webhook (secret redacted)
webhooksRouter.get('/:id', (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid webhook ID format' })
    return
  }

  try {
    const webhook = getWebhook(req.params.id)
    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }
    res.json({ ...webhook, secret: webhook.secret.slice(0, 8) + '...' })
  } catch (err) {
    next(err)
  }
})

// Create a new webhook (returns full secret once)
webhooksRouter.post('/', (req, res, next) => {
  const { name, url, events, template } = req.body

  if (!name || !isValidName(name)) {
    res.status(400).json({ error: 'name is required (max 200 characters)' })
    return
  }
  if (!url || !isValidUrl(url)) {
    res.status(400).json({ error: 'A valid HTTP(S) URL is required' })
    return
  }
  if (!isValidEvents(events)) {
    res.status(400).json({ error: 'events must be a non-empty array of valid event types' })
    return
  }
  if (!isValidTemplate(template)) {
    res.status(400).json({ error: 'template must be "slack", "discord", or null' })
    return
  }

  try {
    const webhook = createWebhook({
      name,
      url,
      events,
      template: template ?? null,
    })

    // Return the full secret (only shown once)
    res.status(201).json({
      ...webhook,
      secret: webhook.plaintextSecret,
    })
  } catch (err) {
    next(err)
  }
})

// Update a webhook
webhooksRouter.patch('/:id', (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid webhook ID format' })
    return
  }

  const { name, url, events, enabled, template } = req.body
  const updates: Parameters<typeof updateWebhook>[1] = {}

  if (name !== undefined) {
    if (!isValidName(name)) {
      res.status(400).json({ error: 'name must be 1-200 characters' })
      return
    }
    updates.name = name
  }
  if (url !== undefined) {
    if (!isValidUrl(url)) {
      res.status(400).json({ error: 'A valid HTTP(S) URL is required' })
      return
    }
    updates.url = url
  }
  if (events !== undefined) {
    if (!isValidEvents(events)) {
      res.status(400).json({ error: 'events must be a non-empty array of valid event types' })
      return
    }
    updates.events = events
  }
  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' })
      return
    }
    updates.enabled = enabled
  }
  if (template !== undefined) {
    if (!isValidTemplate(template)) {
      res.status(400).json({ error: 'template must be "slack", "discord", or null' })
      return
    }
    updates.template = template
  }

  try {
    const webhook = updateWebhook(req.params.id, updates)
    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }
    res.json({ ...webhook, secret: webhook.secret.slice(0, 8) + '...' })
  } catch (err) {
    next(err)
  }
})

// Rotate signing secret (returns new secret once)
webhooksRouter.post('/:id/rotate-secret', (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid webhook ID format' })
    return
  }

  try {
    const result = rotateSecret(req.params.id)
    if (!result) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// Delete a webhook
webhooksRouter.delete('/:id', (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid webhook ID format' })
    return
  }

  try {
    const deleted = deleteWebhook(req.params.id)
    if (!deleted) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

// Send a test ping
webhooksRouter.post('/:id/test', async (req, res, next) => {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ error: 'Invalid webhook ID format' })
    return
  }

  try {
    const result = await sendTestPing(req.params.id)
    res.json(result)
  } catch (err) {
    next(err)
  }
})
