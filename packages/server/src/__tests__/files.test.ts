import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { createTestEnv, SAMPLE_MARKDOWN } from './test-helpers.js'

describe('Files API', () => {
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

  // ─── GET /api/files ───────────────────────────────────────────────

  it('should return empty array initially', async () => {
    const res = await request(app).get('/api/files')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('should list created boards', async () => {
    await request(app).post('/api/files').send({ name: 'Board 1', markdown: SAMPLE_MARKDOWN })
    await request(app).post('/api/files').send({ name: 'Board 2', markdown: '## Todo\n' })

    const res = await request(app).get('/api/files')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].name).toBe('Board 1')
    expect(res.body[1].name).toBe('Board 2')
    // Summary should include taskCount
    expect(typeof res.body[0].taskCount).toBe('number')
  })

  // ─── POST /api/files ──────────────────────────────────────────────

  it('should create a new board', async () => {
    const res = await request(app)
      .post('/api/files')
      .send({ name: 'Test Board', markdown: SAMPLE_MARKDOWN })

    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Test Board')
    expect(res.body.markdown).toBe(SAMPLE_MARKDOWN)
    expect(res.body.id).toBeTruthy()
    expect(res.body.createdAt).toBeTruthy()
    expect(res.body.updatedAt).toBeTruthy()
  })

  it('should create board with default markdown when none provided', async () => {
    const res = await request(app).post('/api/files').send({ name: 'Default Board' })

    expect(res.status).toBe(201)
    expect(res.body.markdown).toBeTruthy()
    expect(res.body.markdown.length).toBeGreaterThan(0)
  })

  it('should return 400 when name is missing', async () => {
    const res = await request(app).post('/api/files').send({ markdown: '## Todo\n' })
    expect(res.status).toBe(400)
  })

  it('should return 400 for empty name', async () => {
    const res = await request(app).post('/api/files').send({ name: '' })
    expect(res.status).toBe(400)
  })

  // ─── GET /api/files/:id ───────────────────────────────────────────

  it('should return a board with parsed data', async () => {
    const createRes = await request(app)
      .post('/api/files')
      .send({ name: 'Test', markdown: SAMPLE_MARKDOWN })
    const fileId = createRes.body.id

    const res = await request(app).get(`/api/files/${fileId}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Test')
    expect(res.body.markdown).toBe(SAMPLE_MARKDOWN)
    expect(res.body.columns).toHaveLength(2)
    expect(res.body.tasks).toHaveLength(3)
    expect(res.headers.etag).toBeTruthy()
  })

  it('should return 404 for non-existent board', async () => {
    const res = await request(app).get('/api/files/nonexistent')
    expect(res.status).toBe(404)
  })

  it('should return 400 for invalid ID format', async () => {
    const res = await request(app).get('/api/files/invalid id with spaces!')
    expect(res.status).toBe(400)
  })

  // ─── PUT /api/files/:id ───────────────────────────────────────────

  it('should update board markdown', async () => {
    const createRes = await request(app)
      .post('/api/files')
      .send({ name: 'Test', markdown: '## Todo\n\n- [ ] Task 1\n' })
    const fileId = createRes.body.id

    const res = await request(app)
      .put(`/api/files/${fileId}`)
      .send({ markdown: '## Done\n\n- [x] Task 1\n' })

    expect(res.status).toBe(200)
    expect(res.body.markdown).toContain('## Done')
    expect(res.headers.etag).toBeTruthy()
  })

  it('should rename a board', async () => {
    const createRes = await request(app)
      .post('/api/files')
      .send({ name: 'Old Name', markdown: '## Todo\n' })
    const fileId = createRes.body.id

    const res = await request(app)
      .put(`/api/files/${fileId}`)
      .send({ name: 'New Name' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Name')
  })

  it('should succeed with matching ETag', async () => {
    const createRes = await request(app)
      .post('/api/files')
      .send({ name: 'Test', markdown: '## Todo\n' })
    const fileId = createRes.body.id

    // Get current ETag
    const getRes = await request(app).get(`/api/files/${fileId}`)
    const etag = getRes.headers.etag

    const res = await request(app)
      .put(`/api/files/${fileId}`)
      .set('If-Match', etag)
      .send({ markdown: '## Updated\n' })

    expect(res.status).toBe(200)
  })

  it('should return 409 with mismatched ETag', async () => {
    const createRes = await request(app)
      .post('/api/files')
      .send({ name: 'Test', markdown: '## Todo\n' })
    const fileId = createRes.body.id

    const res = await request(app)
      .put(`/api/files/${fileId}`)
      .set('If-Match', '"wrong-etag"')
      .send({ markdown: '## Updated\n' })

    expect(res.status).toBe(409)
    expect(res.body.error).toContain('Conflict')
  })

  it('should return 404 when updating non-existent board', async () => {
    const res = await request(app)
      .put('/api/files/nonexistent')
      .send({ markdown: '## Todo\n' })

    expect(res.status).toBe(404)
  })

  // ─── DELETE /api/files/:id ────────────────────────────────────────

  it('should delete a board', async () => {
    const createRes = await request(app)
      .post('/api/files')
      .send({ name: 'ToDelete', markdown: '## Todo\n' })
    const fileId = createRes.body.id

    const deleteRes = await request(app).delete(`/api/files/${fileId}`)
    expect(deleteRes.status).toBe(204)

    const getRes = await request(app).get(`/api/files/${fileId}`)
    expect(getRes.status).toBe(404)
  })

  it('should return 404 when deleting non-existent board', async () => {
    const res = await request(app).delete('/api/files/nonexistent')
    expect(res.status).toBe(404)
  })

  // ─── GET /api/health ──────────────────────────────────────────────

  it('should return health status', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.storage).toBeTruthy()
  })
})
