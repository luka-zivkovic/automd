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

  it('lists inbox items from mentions and help labels', async () => {
    const create = await request(app)
      .post('/api/files')
      .send({
        name: 'Inbox',
        markdown: '# Todo\n\n## Mentioned task\n\n### Comments\n\n- Please check this @review-bot\n\n## Needs help built-by:review-bot #help-wanted\n',
      })

    const res = await request(app).get('/api/inbox?target=review-bot')

    expect(res.status).toBe(200)
    expect(res.body.target).toBe('review-bot')
    expect(res.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'mention',
        itemId: create.body.id,
        body: 'Please check this @review-bot',
      }),
      expect.objectContaining({
        type: 'help_wanted',
        itemId: create.body.id,
        taskTitle: 'Needs help',
      }),
    ]))
  })

  it('forces agent-bound inbox credentials to their own identity', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })
    const token = setup.body.token

    const agentRes = await request(app)
      .post('/api/agents')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Review Bot', slug: 'review-bot' })
    const keyRes = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Review Bot Key', agentId: agentRes.body.id })
    const apiKey = keyRes.body.fullKey

    await request(app)
      .post('/api/files')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Inbox Auth',
        markdown: [
          '# Todo',
          '',
          '## Own mention',
          '',
          '### Comments',
          '',
          '- For @review-bot',
          '',
          '## Other mention',
          '',
          '### Comments',
          '',
          '- For @other-agent',
          '',
          '## Own help built-by:review-bot #help-wanted',
          '',
          '## Other help built-by:other-agent #help-wanted',
        ].join('\n'),
      })

    const forcedTarget = await request(app)
      .get('/api/inbox?target=other-agent')
      .set('Authorization', `Bearer ${apiKey}`)
    expect(forcedTarget.status).toBe(200)
    expect(forcedTarget.body.target).toBe('review-bot')
    expect(forcedTarget.body.items.map((item: any) => item.taskTitle)).toContain('Own help')
    expect(forcedTarget.body.items.map((item: any) => item.taskTitle)).not.toContain('Other help')
    expect(forcedTarget.body.items.map((item: any) => item.body)).toContain('For @review-bot')
    expect(forcedTarget.body.items.map((item: any) => item.body)).not.toContain('For @other-agent')

    const forcedAll = await request(app)
      .get('/api/inbox?all=true')
      .set('Authorization', `Bearer ${apiKey}`)
    expect(forcedAll.body.target).toBe('review-bot')
    expect(forcedAll.body.items.map((item: any) => item.taskTitle)).not.toContain('Other help')

    const adminTarget = await request(app)
      .get('/api/inbox?target=other-agent')
      .set('Authorization', `Bearer ${token}`)
    expect(adminTarget.status).toBe(200)
    expect(adminTarget.body.target).toBe('other-agent')
    expect(adminTarget.body.items.map((item: any) => item.taskTitle)).toContain('Other help')
    expect(adminTarget.body.items.map((item: any) => item.body)).toContain('For @other-agent')
  })

  it('computes agent profile metrics', async () => {
    const agent = await request(app)
      .post('/api/agents')
      .send({ name: 'Review Bot', slug: 'review-bot' })
    expect(agent.status).toBe(201)

    await request(app)
      .post('/api/files')
      .send({
        name: 'Metrics',
        markdown: [
          '# Todo',
          '',
          '## Open task built-by:review-bot',
          '',
          '## Needs help built-by:review-bot #help-wanted status:blocked',
          '',
          '## Other task built-by:other-agent',
          '',
          '# Done',
          '',
          '## [x] Complete task built-by:review-bot claimed-at:2026-05-01T00:00:00.000Z completed-at:2026-05-02',
        ].join('\n'),
      })

    const res = await request(app).get(`/api/agents/${agent.body.id}/metrics`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      slug: 'review-bot',
      totalTasks: 3,
      completedTasks: 1,
      openTasks: 2,
      blockedTasks: 1,
      helpWantedTasks: 1,
      cycleSampleSize: 1,
    })
    expect(res.body.avgCycleTimeMs).toBeGreaterThan(0)
  })

  it('emits and records task reopen events', async () => {
    const agent = await request(app)
      .post('/api/agents')
      .send({ name: 'Review Bot', slug: 'review-bot' })
    const client = await createCollectingWs(port)
    try {
      const create = await request(app)
        .post('/api/files')
        .send({
          name: 'Reopen',
          markdown: '# Done\n\n## [x] Complete task built-by:review-bot completed-at:2026-05-02\n',
        })
      const fileId = create.body.id
      const board = await request(app).get(`/api/files/${fileId}`)
      const taskId = board.body.tasks[0].id

      const toggle = await request(app)
        .patch(`/api/files/${fileId}/tasks/${taskId}`)
        .send({ action: 'toggle' })
      expect(toggle.status).toBe(200)

      expect(await client.waitForNthMessage(2)).toMatchObject({
        type: 'task:reopened',
        payload: {
          itemId: fileId,
          taskId,
          taskTitle: 'Complete task',
          agentSlug: 'review-bot',
        },
      })

      const metrics = await request(app).get(`/api/agents/${agent.body.id}/metrics`)
      expect(metrics.body.reopenCount).toBe(1)
    } finally {
      client.ws.close()
    }
  })

  it('emits reopen events when moving out of the final column', async () => {
    const agent = await request(app)
      .post('/api/agents')
      .send({ name: 'Review Bot', slug: 'review-bot' })
    const client = await createCollectingWs(port)
    try {
      const create = await request(app)
        .post('/api/files')
        .send({
          name: 'Move Reopen',
          markdown: '# Todo\n\n# Shipped\n\n## Complete task built-by:review-bot completed-at:2026-05-02\n',
        })
      const fileId = create.body.id
      const board = await request(app).get(`/api/files/${fileId}`)
      const targetColumnId = board.body.columns.find((c: any) => c.title === 'Todo').id
      const taskId = board.body.tasks[0].id

      const move = await request(app)
        .patch(`/api/files/${fileId}/tasks/${taskId}`)
        .send({ action: 'move', targetColumnId, targetIndex: 0 })
      expect(move.status).toBe(200)

      expect(await client.waitForNthMessage(2)).toMatchObject({
        type: 'task:reopened',
        payload: {
          itemId: fileId,
          taskId,
          taskTitle: 'Complete task',
          agentSlug: 'review-bot',
        },
      })

      const after = await request(app).get(`/api/files/${fileId}`)
      expect(after.body.tasks[0].metadata.completedAt).toBeNull()
      const metrics = await request(app).get(`/api/agents/${agent.body.id}/metrics`)
      expect(metrics.body.reopenCount).toBe(1)
    } finally {
      client.ws.close()
    }
  })
})
