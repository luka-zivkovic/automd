import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import WebSocket from 'ws'
import type { Server } from 'node:http'
import { createTestEnv } from './test-helpers.js'

/**
 * Create a WS client that collects all messages into an array.
 * Use `waitForNthMessage(n)` to wait for the Nth message (0-based).
 */
function createCollectingWs(port: number): Promise<{
  ws: WebSocket
  messages: any[]
  waitForNthMessage: (n: number, timeoutMs?: number) => Promise<any>
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    const messages: any[] = []
    const waiters: Array<{ index: number; resolve: (msg: any) => void; reject: (err: Error) => void }> = []

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      messages.push(msg)
      // Resolve any waiters that are now satisfied
      for (const waiter of waiters) {
        if (messages.length > waiter.index) {
          waiter.resolve(messages[waiter.index])
        }
      }
    })

    function waitForNthMessage(n: number, timeoutMs = 5000): Promise<any> {
      if (messages.length > n) return Promise.resolve(messages[n])
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`Timeout waiting for message ${n}`)), timeoutMs)
        waiters.push({
          index: n,
          resolve: (msg) => { clearTimeout(timer); res(msg) },
          reject: rej,
        })
      })
    }

    ws.once('open', () => resolve({ ws, messages, waitForNthMessage }))
    ws.once('error', reject)
  })
}

describe('WebSocket broadcasts', () => {
  let server: Server
  let port: number
  let cleanup: () => Promise<void>
  let ws: WebSocket
  let messages: any[]
  let waitForNthMessage: (n: number, timeoutMs?: number) => Promise<any>

  beforeEach(async () => {
    const env = await createTestEnv()
    server = env.server
    port = env.port
    cleanup = env.cleanup

    const client = await createCollectingWs(port)
    ws = client.ws
    messages = client.messages
    waitForNthMessage = client.waitForNthMessage
  })

  afterEach(async () => {
    ws.close()
    await cleanup()
  })

  it('should broadcast file:created event', async () => {
    await request(server)
      .post('/api/files')
      .send({ name: 'New Board', markdown: '## Todo\n' })

    const msg = await waitForNthMessage(0)
    expect(msg.type).toBe('file:created')
    expect(msg.payload.name).toBe('New Board')
  })

  it('should broadcast file:updated event on markdown change', async () => {
    // Create a board (generates message 0: file:created)
    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'Test', markdown: '## Todo\n' })
    const boardId = createRes.body.id

    // Update markdown (generates message 1: file:updated)
    await request(server)
      .put(`/api/files/${boardId}`)
      .send({ markdown: '## Done\n' })

    const msg = await waitForNthMessage(1)
    expect(msg.type).toBe('file:updated')
    expect(msg.payload.id).toBe(boardId)
    expect(msg.payload.markdown).toContain('## Done')
  })

  it('should broadcast file:deleted event', async () => {
    // Create a board (generates message 0: file:created)
    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'ToDelete', markdown: '## Todo\n' })
    const boardId = createRes.body.id

    // Delete the board (generates message 1: file:deleted)
    await request(server).delete(`/api/files/${boardId}`)

    const msg = await waitForNthMessage(1)
    expect(msg.type).toBe('file:deleted')
    expect(msg.payload.id).toBe(boardId)
  })

  it('should broadcast to multiple connected clients', async () => {
    const client2 = await createCollectingWs(port)

    await request(server)
      .post('/api/files')
      .send({ name: 'Broadcast Test', markdown: '## Todo\n' })

    const [msg1, msg2] = await Promise.all([
      waitForNthMessage(0),
      client2.waitForNthMessage(0),
    ])

    expect(msg1.type).toBe('file:created')
    expect(msg2.type).toBe('file:created')
    expect(msg1.payload.name).toBe('Broadcast Test')
    expect(msg2.payload.name).toBe('Broadcast Test')

    client2.ws.close()
  })

  it('should broadcast file:updated on task mutation', async () => {
    // Create a board (generates message 0: file:created)
    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'Test', markdown: '## Todo\n\n- [ ] Task 1\n' })
    const boardId = createRes.body.id

    // Get column ID for the board
    const boardRes = await request(server).get(`/api/files/${boardId}`)
    const columnId = boardRes.body.columns[0].id

    // Add a task (generates message 1: file:updated)
    await request(server)
      .post(`/api/files/${boardId}/tasks`)
      .send({ columnId, content: 'New task' })

    const msg = await waitForNthMessage(1)
    expect(msg.type).toBe('file:updated')
    expect(msg.payload.id).toBe(boardId)
  })
})
