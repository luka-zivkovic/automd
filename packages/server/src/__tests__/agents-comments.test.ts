import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import WebSocket from 'ws'
import type { Server } from 'node:http'
import { createTestEnv } from './test-helpers.js'
import { releaseStaleClaims } from '../agent-storage.js'

function createCollectingWs(port: number): Promise<{
  ws: WebSocket
  waitForNthMessage: (n: number, timeoutMs?: number) => Promise<any>
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    const messages: any[] = []
    const waiters: Array<{ index: number; resolve: (msg: any) => void; reject: (err: Error) => void }> = []

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      messages.push(msg)
      for (const waiter of waiters) {
        if (messages.length > waiter.index) waiter.resolve(messages[waiter.index])
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

    ws.once('open', () => resolve({ ws, waitForNthMessage }))
    ws.once('error', reject)
  })
}

describe('Agents and comments API', () => {
  let app: Server
  let port: number
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const env = await createTestEnv()
    app = env.server
    port = env.port
    cleanup = env.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  it('filters sensitive env keys when creating agents', async () => {
    const res = await request(app)
      .post('/api/agents')
      .send({
        name: 'Helper Agent',
        env: {
          SAFE_FLAG: 'yes',
          AUTOMD_API_KEY: 'nope',
          GITHUB_TOKEN: 'nope',
          SECRET_VALUE: 'nope',
        },
      })

    expect(res.status).toBe(201)
    expect(res.body.env).toEqual({ SAFE_FLAG: 'yes' })
  })

  it('parses free-form comment bullets instead of dropping them', async () => {
    const create = await request(app)
      .post('/api/files')
      .send({
        name: 'Comments',
        markdown: '# Todo\n\n## Task\n\n### Comments\n\n- Free-form note for @alice\n',
      })
    const fileId = create.body.id
    const board = await request(app).get(`/api/files/${fileId}`)
    const taskId = board.body.tasks[0].id

    const res = await request(app).get(`/api/files/${fileId}/tasks/${taskId}/comments`)

    expect(res.status).toBe(200)
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0]).toMatchObject({
      author: 'unknown',
      body: 'Free-form note for @alice',
      mentions: ['alice'],
    })
  })

  it('binds comment author to the agent API key credential', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })
    const token = setup.body.token

    const agentRes = await request(app)
      .post('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Review Bot', slug: 'review-bot' })
    expect(agentRes.status).toBe(201)

    const keyRes = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Review Bot Key', agentId: agentRes.body.id })
    const apiKey = keyRes.body.fullKey

    const create = await request(app)
      .post('/api/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Comments', markdown: '# Todo\n\n## Task\n' })
    const fileId = create.body.id
    const board = await request(app)
      .get(`/api/files/${fileId}`)
      .set('Authorization', `Bearer ${token}`)
    const taskId = board.body.tasks[0].id

    const comment = await request(app)
      .post(`/api/files/${fileId}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${apiKey}`)
      .send({ author: 'spoofed', body: 'Starting work' })

    expect(comment.status).toBe(201)
    expect(comment.body.author).toBe('review-bot')
  })

  it('releases stale claims and emits a claim release event', async () => {
    const client = await createCollectingWs(port)
    try {
      const claimedAt = '2000-01-01T00:00:00.000Z'
      const create = await request(app)
        .post('/api/files')
        .send({
          name: 'Stale Claims',
          markdown: `# Todo\n\n## Stale task built-by:review-bot claimed-at:${claimedAt}\n`,
        })
      const fileId = create.body.id
      const board = await request(app).get(`/api/files/${fileId}`)
      const taskId = board.body.tasks[0].id

      expect(board.body.tasks[0].metadata.builtBy).toBe('review-bot')
      expect(releaseStaleClaims(1)).toBe(1)

      expect(await client.waitForNthMessage(1)).toMatchObject({
        type: 'file:updated',
        payload: { id: fileId },
      })
      expect(await client.waitForNthMessage(2)).toMatchObject({
        type: 'task:claim_released',
        payload: { itemId: fileId, taskId, slug: 'review-bot', reason: 'stale' },
      })

      const after = await request(app).get(`/api/files/${fileId}`)
      expect(after.body.tasks[0].metadata.builtBy).toBeNull()
      expect(after.body.tasks[0].metadata.claimedAt).toBeNull()
    } finally {
      client.ws.close()
    }
  })
})
