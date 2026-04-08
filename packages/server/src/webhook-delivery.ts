import crypto from 'node:crypto'
import { nanoid } from 'nanoid'
import { listWebhooks, updateWebhookStats } from './webhook-storage.js'
import { formatPayload } from './webhook-templates.js'
import type {
  WebhookEventType,
  WebhookEventData,
  WebhookPayload,
} from './webhook-events.js'

// ─── Per-webhook delivery queues ─────────────────────────────────────────

const deliveryQueues = new Map<string, Promise<void>>()

function enqueue(webhookId: string, op: () => Promise<void>): void {
  const current = deliveryQueues.get(webhookId) ?? Promise.resolve()
  const next = current.then(op, op) // continue regardless of success/failure
  deliveryQueues.set(webhookId, next.then(() => {}, () => {}))
}

// ─── HMAC signing ────────────────────────────────────────────────────────

function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

// ─── HTTP delivery with retry ────────────────────────────────────────────

const RETRY_DELAYS = [0, 2000, 8000] // immediate, 2s, 8s

async function deliverWithRetry(
  url: string,
  body: string,
  signature: string,
  event: string,
  deliveryId: string,
  maxAttempts = 3,
): Promise<{ success: boolean; statusCode: number | null }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]))
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AutoMD-Webhooks/0.1.0',
          'X-AutoMD-Delivery': deliveryId,
          'X-AutoMD-Event': event,
          'X-AutoMD-Signature-256': `sha256=${signature}`,
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok) {
        return { success: true, statusCode: response.status }
      }

      // Don't retry on 4xx (client error)
      if (response.status >= 400 && response.status < 500) {
        console.warn(
          `[webhooks] Delivery ${deliveryId} rejected: HTTP ${response.status} (no retry)`,
        )
        return { success: false, statusCode: response.status }
      }

      console.warn(
        `[webhooks] Delivery ${deliveryId} attempt ${attempt + 1} failed: HTTP ${response.status}`,
      )
    } catch (err) {
      clearTimeout(timeout)
      console.warn(
        `[webhooks] Delivery ${deliveryId} attempt ${attempt + 1} error:`,
        (err as Error).message,
      )
    }
  }

  return { success: false, statusCode: null }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Dispatch a webhook event to all matching registered webhooks.
 * Returns immediately — delivery happens asynchronously.
 */
export function dispatchWebhookEvent(
  event: WebhookEventType,
  data: WebhookEventData,
): void {
  let webhooks: ReturnType<typeof listWebhooks>
  try {
    webhooks = listWebhooks().filter(
      (wh) => wh.enabled && wh.events.includes(event),
    )
  } catch {
    // Don't let webhook failures affect normal operations
    return
  }

  if (webhooks.length === 0) return

  for (const webhook of webhooks) {
    const deliveryId = nanoid(16)
    const payload: WebhookPayload = {
      id: deliveryId,
      event,
      timestamp: new Date().toISOString(),
      data,
    }

    const formatted = formatPayload(payload, webhook.template)
    const bodyStr = JSON.stringify(formatted)
    const signature = signPayload(bodyStr, webhook.secret)

    enqueue(webhook.id, async () => {
      const result = await deliverWithRetry(
        webhook.url,
        bodyStr,
        signature,
        event,
        deliveryId,
      )
      updateWebhookStats(webhook.id, result.success, result.statusCode)
    })
  }
}

/**
 * Send a test ping to a specific webhook. Unlike dispatchWebhookEvent,
 * this waits for the result and returns it.
 */
export async function sendTestPing(
  webhookId: string,
): Promise<{ success: boolean; statusCode: number | null; error?: string }> {
  let webhooks: ReturnType<typeof listWebhooks>
  try {
    webhooks = listWebhooks()
  } catch {
    return { success: false, statusCode: null, error: 'Failed to read webhook config' }
  }

  const webhook = webhooks.find((w) => w.id === webhookId)
  if (!webhook) {
    return { success: false, statusCode: null, error: 'Webhook not found' }
  }

  const deliveryId = nanoid(16)
  const payload: WebhookPayload = {
    id: deliveryId,
    event: 'board.updated',
    timestamp: new Date().toISOString(),
    data: { boardId: 'test', boardName: 'Test Ping from AutoMD' },
  }

  const formatted = formatPayload(payload, webhook.template)
  const bodyStr = JSON.stringify(formatted)
  const signature = signPayload(bodyStr, webhook.secret)

  return deliverWithRetry(webhook.url, bodyStr, signature, payload.event, deliveryId, 1)
}
