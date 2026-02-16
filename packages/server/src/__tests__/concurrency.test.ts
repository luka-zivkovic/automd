import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { createTestEnv } from './test-helpers.js'

describe('Concurrent writes with locking', () => {
  let app: Server
  let cleanup: () => Promise<void>
  let fileId: string

  beforeEach(async () => {
    const env = await createTestEnv()
    app = env.server
    cleanup = env.cleanup

    const res = await request(app)
      .post('/api/files')
      .send({ name: 'Concurrency Test', markdown: '## Todo\n\n- [ ] Task 1\n' })
    fileId = res.body.id
  })

  afterEach(async () => {
    await cleanup()
  })

  it('should handle concurrent task additions without data loss', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const columnId = boardRes.body.columns[0].id

    // Fire 10 concurrent requests to add tasks
    const promises = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post(`/api/files/${fileId}/tasks`)
        .send({ columnId, content: `Concurrent task ${i}` })
    )

    const results = await Promise.all(promises)

    // All should succeed (201)
    const successes = results.filter((r) => r.status === 201)
    expect(successes.length).toBe(10)

    // Verify all 11 tasks exist (1 original + 10 new)
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    expect(verifyRes.body.tasks).toHaveLength(11)

    // Verify no duplicate task IDs
    const taskIds = verifyRes.body.tasks.map((t: any) => t.id)
    expect(new Set(taskIds).size).toBe(11)
  })

  it('should serialize concurrent toggles consistently', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    // Fire 20 concurrent toggle requests
    const toggleCount = 20
    const promises = Array.from({ length: toggleCount }, () =>
      request(app)
        .patch(`/api/files/${fileId}/tasks/${taskId}`)
        .send({ action: 'toggle' })
    )

    const results = await Promise.all(promises)

    // All should succeed
    expect(results.every((r) => r.status === 200)).toBe(true)

    // Final state should be consistent — toggled 20 times from false → false (even)
    // Look up by display content since IDs may change after re-parse
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    const task = verifyRes.body.tasks.find(
      (t: any) => t.displayContent === boardRes.body.tasks[0].displayContent
    )
    expect(task).toBeTruthy()
    expect(task.checked).toBe(false)
  })

  it('should handle concurrent file creation', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      request(app)
        .post('/api/files')
        .send({ name: `Board ${i}`, markdown: '## Todo\n' })
    )

    const results = await Promise.all(promises)

    // All should succeed
    expect(results.every((r) => r.status === 201)).toBe(true)

    // Verify all boards exist (1 from beforeEach + 5 new)
    const listRes = await request(app).get('/api/files')
    expect(listRes.body).toHaveLength(6)

    // Verify unique IDs
    const ids = listRes.body.map((f: any) => f.id)
    expect(new Set(ids).size).toBe(6)
  })
})
