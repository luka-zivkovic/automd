import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { createTestEnv } from './test-helpers.js'

describe('Webhooks API', () => {
  let app: Server
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const env = await createTestEnv()
    app = env.server
    cleanup = env.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  // ─── POST /api/webhooks ──────────────────────────────────────────────

  it('should create a webhook and return the secret', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .send({
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['task.created', 'task.completed'],
      })

    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.name).toBe('Test Webhook')
    expect(res.body.url).toBe('https://example.com/webhook')
    expect(res.body.events).toEqual(['task.created', 'task.completed'])
    expect(res.body.enabled).toBe(true)
    expect(res.body.template).toBeNull()
    // Secret should be the full 64-char hex string (not redacted)
    expect(res.body.secret.length).toBe(64)
    expect(res.body.secret).not.toContain('...')
  })

  it('should create a webhook with a template', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .send({
        name: 'Slack Hook',
        url: 'https://hooks.slack.com/services/xxx',
        events: ['task.completed'],
        template: 'slack',
      })

    expect(res.status).toBe(201)
    expect(res.body.template).toBe('slack')
  })

  it('should reject missing name', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .send({ url: 'https://example.com', events: ['task.created'] })

    expect(res.status).toBe(400)
  })

  it('should reject invalid URL', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Bad', url: 'not-a-url', events: ['task.created'] })

    expect(res.status).toBe(400)
  })

  it('should reject invalid events', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Bad', url: 'https://example.com', events: ['invalid.event'] })

    expect(res.status).toBe(400)
  })

  it('should reject empty events array', async () => {
    const res = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Bad', url: 'https://example.com', events: [] })

    expect(res.status).toBe(400)
  })

  // ─── GET /api/webhooks ───────────────────────────────────────────────

  it('should list webhooks with redacted secrets', async () => {
    await request(app)
      .post('/api/webhooks')
      .send({ name: 'Hook 1', url: 'https://a.com/1', events: ['task.created'] })

    await request(app)
      .post('/api/webhooks')
      .send({ name: 'Hook 2', url: 'https://b.com/2', events: ['board.created'] })

    const res = await request(app).get('/api/webhooks')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].name).toBe('Hook 1')
    expect(res.body[1].name).toBe('Hook 2')
    // Secrets should be redacted
    expect(res.body[0].secret).toContain('...')
    expect(res.body[0].secret.length).toBeLessThan(64)
  })

  // ─── GET /api/webhooks/:id ───────────────────────────────────────────

  it('should get a single webhook with redacted secret', async () => {
    const createRes = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Hook', url: 'https://a.com', events: ['task.created'] })

    const id = createRes.body.id
    const res = await request(app).get(`/api/webhooks/${id}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(id)
    expect(res.body.secret).toContain('...')
  })

  it('should return 404 for unknown webhook', async () => {
    const res = await request(app).get('/api/webhooks/nonexistent')

    expect(res.status).toBe(404)
  })

  // ─── PATCH /api/webhooks/:id ─────────────────────────────────────────

  it('should update webhook fields', async () => {
    const createRes = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Hook', url: 'https://a.com', events: ['task.created'] })

    const id = createRes.body.id

    const res = await request(app)
      .patch(`/api/webhooks/${id}`)
      .send({
        name: 'Updated Hook',
        events: ['task.completed', 'board.deleted'],
        enabled: false,
      })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Hook')
    expect(res.body.events).toEqual(['task.completed', 'board.deleted'])
    expect(res.body.enabled).toBe(false)
  })

  it('should return 404 for updating unknown webhook', async () => {
    const res = await request(app)
      .patch('/api/webhooks/nonexistent')
      .send({ name: 'New Name' })

    expect(res.status).toBe(404)
  })

  // ─── POST /api/webhooks/:id/rotate-secret ────────────────────────────

  it('should rotate the signing secret', async () => {
    const createRes = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Hook', url: 'https://a.com', events: ['task.created'] })

    const id = createRes.body.id
    const originalSecret = createRes.body.secret

    const res = await request(app).post(`/api/webhooks/${id}/rotate-secret`)

    expect(res.status).toBe(200)
    expect(res.body.secret).toBeDefined()
    expect(res.body.secret.length).toBe(64)
    expect(res.body.secret).not.toBe(originalSecret)
  })

  // ─── DELETE /api/webhooks/:id ────────────────────────────────────────

  it('should delete a webhook', async () => {
    const createRes = await request(app)
      .post('/api/webhooks')
      .send({ name: 'Hook', url: 'https://a.com', events: ['task.created'] })

    const id = createRes.body.id

    const deleteRes = await request(app).delete(`/api/webhooks/${id}`)
    expect(deleteRes.status).toBe(204)

    const getRes = await request(app).get(`/api/webhooks/${id}`)
    expect(getRes.status).toBe(404)
  })

  it('should return 404 for deleting unknown webhook', async () => {
    const res = await request(app).delete('/api/webhooks/nonexistent')
    expect(res.status).toBe(404)
  })

  // ─── Webhook persistence ────────────────────────────────────────────

  it('should persist webhooks across list calls', async () => {
    await request(app)
      .post('/api/webhooks')
      .send({ name: 'Persistent', url: 'https://a.com', events: ['task.created'] })

    const list1 = await request(app).get('/api/webhooks')
    expect(list1.body).toHaveLength(1)

    await request(app)
      .post('/api/webhooks')
      .send({ name: 'Second', url: 'https://b.com', events: ['board.created'] })

    const list2 = await request(app).get('/api/webhooks')
    expect(list2.body).toHaveLength(2)
  })
})
