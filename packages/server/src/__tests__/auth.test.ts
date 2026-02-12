import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { createTestEnv } from './test-helpers.js'

describe('Auth API', () => {
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

  // ─── GET /api/auth/status ─────────────────────────────────────────

  it('should report setup incomplete initially', async () => {
    const res = await request(app).get('/api/auth/status')
    expect(res.status).toBe(200)
    expect(res.body.setupComplete).toBe(false)
    expect(res.body.authEnabled).toBe(false)
  })

  it('should report setup complete after admin created', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app).get('/api/auth/status')
    expect(res.status).toBe(200)
    expect(res.body.setupComplete).toBe(true)
    expect(res.body.authEnabled).toBe(true)
  })

  // ─── POST /api/auth/setup ─────────────────────────────────────────

  it('should create admin and return token', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(typeof res.body.token).toBe('string')
    expect(res.body.expiresAt).toBeDefined()
  })

  it('should reject if admin already exists', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin2@test.com', password: 'password456' })

    expect(res.status).toBe(403)
  })

  it('should reject invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'notanemail', password: 'password123' })

    expect(res.status).toBe(400)
  })

  it('should reject short password', async () => {
    const res = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: '1234567' })

    expect(res.status).toBe(400)
  })

  // ─── POST /api/auth/login ─────────────────────────────────────────

  it('should login with valid credentials', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  it('should reject invalid password', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
  })

  it('should reject unknown email', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'other@test.com', password: 'password123' })

    expect(res.status).toBe(401)
  })

  // ─── Protected routes ─────────────────────────────────────────────

  it('should allow access without auth when no admin exists', async () => {
    const res = await request(app).get('/api/files')
    expect(res.status).toBe(200)
  })

  it('should require auth after admin is created', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app).get('/api/files')
    expect(res.status).toBe(401)
  })

  it('should accept valid session token', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const token = setup.body.token
    const res = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  it('should reject invalid token', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app)
      .get('/api/files')
      .set('Authorization', 'Bearer invalid-token')

    expect(res.status).toBe(401)
  })

  // ─── Health + Version stay public ─────────────────────────────────

  it('should allow /api/health without auth', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.authRequired).toBe(true)
  })

  it('should allow /api/version without auth', async () => {
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app).get('/api/version')
    expect(res.status).toBe(200)
  })

  // ─── GET /api/auth/me ─────────────────────────────────────────────

  it('should return admin info with valid token', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${setup.body.token}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('admin@test.com')
    expect(res.body.createdAt).toBeDefined()
  })

  // ─── POST /api/auth/logout ────────────────────────────────────────

  it('should invalidate session on logout', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    const token = setup.body.token

    // Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(logoutRes.status).toBe(204)

    // Token should no longer work
    const res = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  // ─── API Keys ─────────────────────────────────────────────────────

  it('should create and list API keys', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })
    const token = setup.body.token

    // Create
    const createRes = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'MCP Key' })

    expect(createRes.status).toBe(201)
    expect(createRes.body.fullKey).toBeDefined()
    expect(createRes.body.fullKey).toMatch(/^amd_/)
    expect(createRes.body.name).toBe('MCP Key')

    // List
    const listRes = await request(app)
      .get('/api/auth/api-keys')
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body).toHaveLength(1)
    expect(listRes.body[0].name).toBe('MCP Key')
    // fullKey should NOT be in the list response
    expect(listRes.body[0].fullKey).toBeUndefined()
  })

  it('should authenticate with API key', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })
    const token = setup.body.token

    const createRes = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Key' })
    const apiKey = createRes.body.fullKey

    // Use API key to access protected route
    const res = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${apiKey}`)

    expect(res.status).toBe(200)
  })

  it('should delete API key', async () => {
    const setup = await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })
    const token = setup.body.token

    const createRes = await request(app)
      .post('/api/auth/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Temp Key' })
    const apiKeyId = createRes.body.id
    const apiKey = createRes.body.fullKey

    // Delete
    const deleteRes = await request(app)
      .delete(`/api/auth/api-keys/${apiKeyId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(204)

    // API key should no longer work
    const res = await request(app)
      .get('/api/files')
      .set('Authorization', `Bearer ${apiKey}`)
    expect(res.status).toBe(401)
  })
})

describe('Auth disabled mode', () => {
  let app: Server
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    process.env.AUTOMD_DISABLE_AUTH = 'true'
    const env = await createTestEnv()
    app = env.server
    cleanup = env.cleanup
  })

  afterEach(async () => {
    delete process.env.AUTOMD_DISABLE_AUTH
    await cleanup()
  })

  it('should report authEnabled false', async () => {
    const res = await request(app).get('/api/auth/status')
    expect(res.body.authEnabled).toBe(false)
  })

  it('should allow unauthenticated access even after admin setup', async () => {
    // Create admin
    await request(app)
      .post('/api/auth/setup')
      .send({ email: 'admin@test.com', password: 'password123' })

    // Should still be accessible without token
    const res = await request(app).get('/api/files')
    expect(res.status).toBe(200)
  })
})
