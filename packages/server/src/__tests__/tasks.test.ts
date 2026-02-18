import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { createTestEnv, SAMPLE_MARKDOWN } from './test-helpers.js'

describe('Tasks API', () => {
  let app: Server
  let cleanup: () => Promise<void>
  let fileId: string

  beforeEach(async () => {
    const env = await createTestEnv()
    app = env.server
    cleanup = env.cleanup

    // Create a test board
    const res = await request(app)
      .post('/api/files')
      .send({ name: 'Test Board', markdown: SAMPLE_MARKDOWN })
    fileId = res.body.id
  })

  afterEach(async () => {
    await cleanup()
  })

  // ─── GET /api/files/:fileId/tasks ─────────────────────────────────

  it('should list tasks and columns', async () => {
    const res = await request(app).get(`/api/files/${fileId}/tasks`)

    expect(res.status).toBe(200)
    expect(res.body.columns).toHaveLength(2) // Todo, Done
    expect(res.body.tasks).toHaveLength(3) // Task 1, 2, 3
    expect(res.headers.etag).toBeTruthy()
  })

  it('should return 404 for non-existent board', async () => {
    const res = await request(app).get('/api/files/nonexistent/tasks')
    expect(res.status).toBe(404)
  })

  it('should return 400 for invalid board ID', async () => {
    const res = await request(app).get('/api/files/invalid id!/tasks')
    expect(res.status).toBe(400)
  })

  // ─── POST /api/files/:fileId/tasks ────────────────────────────────

  it('should add a task to a column', async () => {
    // Get the first column's ID
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const columnId = boardRes.body.columns[0].id

    const res = await request(app)
      .post(`/api/files/${fileId}/tasks`)
      .send({ columnId, content: 'New task @alice #urgent' })

    expect(res.status).toBe(201)
    expect(res.body.taskId).toBeTruthy()
    expect(res.body.content).toBe('New task @alice #urgent')

    // Verify task was added
    const verifyRes = await request(app).get(`/api/files/${fileId}/tasks`)
    expect(verifyRes.body.tasks).toHaveLength(4)
  })

  it('should return 400 when columnId is missing', async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/tasks`)
      .send({ content: 'Task without column' })

    expect(res.status).toBe(400)
  })

  it('should return 400 when content is missing', async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/tasks`)
      .send({ columnId: 'some-id' })

    expect(res.status).toBe(400)
  })

  it('should return 409 with stale ETag', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const columnId = boardRes.body.columns[0].id

    // Add a task to make the ETag stale
    await request(app)
      .post(`/api/files/${fileId}/tasks`)
      .send({ columnId, content: 'First add' })

    // Now try with the old ETag
    const res = await request(app)
      .post(`/api/files/${fileId}/tasks`)
      .set('If-Match', boardRes.headers.etag)
      .send({ columnId, content: 'Second add with stale etag' })

    expect(res.status).toBe(409)
  })

  // ─── PATCH /api/files/:fileId/tasks/:taskId ───────────────────────

  it('should toggle a task', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id
    expect(boardRes.body.tasks[0].checked).toBeNull()

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({ action: 'toggle' })

    expect(res.status).toBe(200)

    // Verify toggle — look up by content since IDs may change after re-parse
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    const toggledTask = verifyRes.body.tasks.find(
      (t: any) => t.displayContent === boardRes.body.tasks[0].displayContent
    )
    expect(toggledTask).toBeTruthy()
    expect(toggledTask.checked).toBe(true)
  })

  it('should move a task between columns', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id // Task 1 in Todo
    const targetColumnId = boardRes.body.columns[1].id // Done column
    const originalTodoCount = boardRes.body.columns[0].tasks.length
    const originalDoneCount = boardRes.body.columns[1].tasks.length

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({ action: 'move', targetColumnId, targetIndex: 0 })

    expect(res.status).toBe(200)

    // Verify move — Todo should have fewer, Done should have more
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    const todoCol = verifyRes.body.columns.find((c: any) => c.title === 'Todo')
    const doneCol = verifyRes.body.columns.find((c: any) => c.title === 'Done')

    expect(todoCol.tasks.length).toBe(originalTodoCount - 1)
    expect(doneCol.tasks.length).toBe(originalDoneCount + 1)
  })

  it('should return 400 when move is missing targetColumnId', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({ action: 'move', targetIndex: 0 })

    expect(res.status).toBe(400)
  })

  it('should update task content', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({ action: 'updateContent', content: 'Updated content @bob' })

    expect(res.status).toBe(200)

    // Verify update — check the raw markdown contains the new content
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    expect(verifyRes.body.markdown).toContain('Updated content @bob')
  })

  it('should return 400 for updateContent without content', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({ action: 'updateContent' })

    expect(res.status).toBe(400)
  })

  it('should update task metadata', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({
        action: 'updateMetadata',
        displayContent: 'Updated task',
        metadata: {
          assignees: ['alice'],
          labels: ['backend'],
          priority: 'high',
          dueDate: '2025-06-01',
          estimate: 5,
          createdBy: null,
          builtBy: null,
          archived: false,
        },
      })

    expect(res.status).toBe(200)

    // Verify via markdown content
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    expect(verifyRes.body.markdown).toContain('@alice')
    expect(verifyRes.body.markdown).toContain('priority:high')
    expect(verifyRes.body.markdown).toContain('#backend')
  })

  it('should return 400 for unknown action', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    const res = await request(app)
      .patch(`/api/files/${fileId}/tasks/${taskId}`)
      .send({ action: 'unknownAction' })

    expect(res.status).toBe(400)
  })

  // ─── DELETE /api/files/:fileId/tasks/:taskId ──────────────────────

  it('should delete a task', async () => {
    const boardRes = await request(app).get(`/api/files/${fileId}`)
    const taskId = boardRes.body.tasks[0].id

    const res = await request(app).delete(`/api/files/${fileId}/tasks/${taskId}`)
    expect(res.status).toBe(204)

    // Verify deletion — check via markdown that "Task 1" is gone
    const verifyRes = await request(app).get(`/api/files/${fileId}`)
    expect(verifyRes.body.markdown).not.toContain('Task 1')
    expect(verifyRes.body.markdown).toContain('Task 2')
  })

  it('should return 404 for task in non-existent board', async () => {
    const res = await request(app).delete('/api/files/nonexistent/tasks/sometask')
    expect(res.status).toBe(404)
  })
})
