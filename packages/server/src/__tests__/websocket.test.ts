import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import WebSocket from 'ws'
import type { Server } from 'node:http'
import { createTestEnv } from './test-helpers.js'
import { broadcast } from '../ws.js'
import { getAutomdDir } from '../config.js'
import { resetAuthCache } from '../auth-storage.js'

/**
 * Create a WS client that collects all messages into an array.
 * Use `waitForNthMessage(n)` to wait for the Nth message (0-based).
 */
function createCollectingWs(port: number, options: { since?: number; serverId?: string; token?: string; username?: string; includeSystem?: boolean } = {}): Promise<{
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
      if (!options.includeSystem && msg.type === 'ws:welcome') return
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

    ws.once('open', () => {
      ws.send(JSON.stringify({
        type: 'ws:hello',
        payload: {
          token: options.token,
          username: options.username,
          since: options.since,
          serverId: options.serverId,
        },
      }))
      resolve({ ws, messages, waitForNthMessage })
    })
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

  it('should send welcome metadata on connect', async () => {
    const client = await createCollectingWs(port, { includeSystem: true })
    try {
      const msg = await client.waitForNthMessage(0)
      expect(msg.type).toBe('ws:welcome')
      expect(msg.payload.serverId).toEqual(expect.any(String))
      expect(msg.payload.currentSeq).toBeGreaterThanOrEqual(0)
      expect(msg.payload.replayLimit).toBeGreaterThan(0)
    } finally {
      client.ws.close()
    }
  })

  it('should authenticate with a post-connect handshake', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    const setupRes = await request(server)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const client = await createCollectingWs(port, { token: setupRes.body.token, includeSystem: true })
    try {
      const msg = await client.waitForNthMessage(0)
      expect(msg.type).toBe('ws:welcome')
      expect(client.ws.url).toBe(`ws://localhost:${port}/ws`)
    } finally {
      client.ws.close()
    }
  })

  it('should reject an invalid post-connect handshake token', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    await request(server)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const client = new WebSocket(`ws://localhost:${port}/ws`)
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      client.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve())
      client.once('error', reject)
    })
    client.send(JSON.stringify({ type: 'ws:hello', payload: { token: 'invalid-token' } }))

    const close = await closed
    expect(close.code).toBe(1008)
    expect(close.reason).toBe('Unauthorized')
  })

  it('should allow disabled-auth websocket recovery when setup is locked', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    await request(server)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })
    fs.rmSync(path.join(getAutomdDir(), 'auth.json'), { force: true })
    resetAuthCache()
    process.env.AUTOMD_DISABLE_AUTH = 'true'

    let client: Awaited<ReturnType<typeof createCollectingWs>> | null = null
    try {
      client = await createCollectingWs(port, { includeSystem: true })
      const msg = await client.waitForNthMessage(0)
      expect(msg.type).toBe('ws:welcome')
    } finally {
      client?.ws.close()
      delete process.env.AUTOMD_DISABLE_AUTH
      resetAuthCache()
    }
  })

  it('should close auth-required sockets that never send hello', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    await request(server)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const client = new WebSocket(`ws://localhost:${port}/ws`)
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      client.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve())
      client.once('error', reject)
    })

    const close = await closed
    expect(close.code).toBe(1008)
    expect(close.reason).toBe('Unauthorized')
  })

  it('should not broadcast to an auth-required socket before hello', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    await request(server)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const client = new WebSocket(`ws://localhost:${port}/ws`)
    const messages: any[] = []
    client.on('message', (data) => messages.push(JSON.parse(data.toString())))
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
      client.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve())
      client.once('error', reject)
    })

    broadcast({ type: 'test:event', payload: { ok: true } })
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(messages).toHaveLength(0)

    client.send(JSON.stringify({ type: 'presence:join', payload: { username: 'pre-auth' } }))
    const close = await closed
    expect(close.code).toBe(1008)
    expect(close.reason).toBe('Unauthorized')
  })

  it('should ignore duplicate hello messages instead of replaying twice', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'Duplicate Hello', markdown: '## Todo\n' })

    const replayClient = await createCollectingWs(port, { since: 0, includeSystem: true })
    try {
      const welcome = await replayClient.waitForNthMessage(0)
      const replayed = await replayClient.waitForNthMessage(1)
      expect(welcome.type).toBe('ws:welcome')
      expect(replayed.type).toBe('file:created')
      expect(replayed.payload.id).toBe(createRes.body.id)

      replayClient.ws.send(JSON.stringify({ type: 'ws:hello', payload: { since: 0 } }))
      await new Promise((resolve) => setTimeout(resolve, 25))
      expect(replayClient.messages).toHaveLength(2)
    } finally {
      replayClient.ws.close()
    }
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

  it('should replay missed events after reconnect', async () => {
    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'Replay', markdown: '## Todo\n' })
    const boardId = createRes.body.id

    const created = await waitForNthMessage(0)
    expect(created.type).toBe('file:created')
    expect(created.seq).toBeGreaterThan(0)

    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    await request(server)
      .put(`/api/files/${boardId}`)
      .send({ markdown: '## Done\n' })

    const replayClient = await createCollectingWs(port, { since: created.seq })
    try {
      const replayed = await replayClient.waitForNthMessage(0)
      expect(replayed.type).toBe('file:updated')
      expect(replayed.payload.id).toBe(boardId)
      expect(replayed.payload.markdown).toContain('## Done')
      expect(replayed.seq).toBeGreaterThan(created.seq)
      expect(replayed.replayed).toBe(true)
    } finally {
      replayClient.ws.close()
    }
  })

  it('should replay from the beginning with since=0', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'Replay Since Zero', markdown: '## Todo\n' })

    const replayClient = await createCollectingWs(port, { since: 0 })
    try {
      const replayed = await replayClient.waitForNthMessage(0)
      expect(replayed.type).toBe('file:created')
      expect(replayed.payload.id).toBe(createRes.body.id)
      expect(replayed.replayed).toBe(true)
    } finally {
      replayClient.ws.close()
    }
  })

  it('should not replay presence lists', async () => {
    ws.send(JSON.stringify({ type: 'presence:join', payload: { username: 'Test' } }))
    const presence = await waitForNthMessage(0)
    expect(presence.type).toBe('presence:list')

    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    const replayClient = await createCollectingWs(port, { since: 0 })
    try {
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(replayClient.messages).toHaveLength(0)
    } finally {
      replayClient.ws.close()
    }
  })

  it('should replay from zero when client server id is stale', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    const createRes = await request(server)
      .post('/api/files')
      .send({ name: 'Replay Server Id', markdown: '## Todo\n' })

    const replayClient = await createCollectingWs(port, { since: 42, serverId: 'previous-server' })
    try {
      const replayed = await replayClient.waitForNthMessage(0)
      expect(replayed.type).toBe('file:created')
      expect(replayed.payload.id).toBe(createRes.body.id)
      expect(replayed.replayed).toBe(true)
    } finally {
      replayClient.ws.close()
    }
  })

  it('should report a replay gap when the buffer overflowed', async () => {
    await new Promise<void>((resolve) => {
      ws.once('close', () => resolve())
      ws.close()
    })

    for (let i = 0; i < 502; i++) {
      broadcast({ type: 'test:event', payload: { i } })
    }

    const replayClient = await createCollectingWs(port, { since: 0 })
    try {
      const gap = await replayClient.waitForNthMessage(0)
      expect(gap.type).toBe('replay:gap')
      expect(gap.payload.since).toBe(0)
      expect(gap.payload.lowestSeq).toBeGreaterThan(1)
      expect(gap.payload.currentSeq).toBeGreaterThanOrEqual(gap.payload.lowestSeq)
    } finally {
      replayClient.ws.close()
    }
  })
})
