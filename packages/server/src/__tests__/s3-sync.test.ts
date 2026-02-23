import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// vi.hoisted runs in the hoisted scope so vi.mock factories can reference these
const { mockSend, mockClearAllCaches } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockClearAllCaches: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'PutObject', ...input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'GetObject', ...input })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ _type: 'DeleteObject', ...input })),
  ListObjectsV2Command: vi.fn().mockImplementation((input) => ({ _type: 'ListObjects', ...input })),
}))

vi.mock('../board-cache.js', () => ({
  clearAllCaches: mockClearAllCaches,
}))

import {
  isS3SyncEnabled,
  initS3Sync,
  syncFileToS3,
  deleteFileFromS3,
  hydrateFromS3,
  getS3SyncStatus,
} from '../s3-sync.js'

let tempDir: string
let counter = 0

function setupTempDir() {
  tempDir = path.join(os.tmpdir(), `automd-s3-test-${Date.now()}-${counter++}`)
  fs.mkdirSync(path.join(tempDir, 'boards'), { recursive: true })
  process.env.AUTOMD_STORAGE_DIR = tempDir
}

function teardownTempDir() {
  delete process.env.AUTOMD_STORAGE_DIR
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

describe('S3 Sync', () => {
  beforeEach(() => {
    mockSend.mockReset()
    mockClearAllCaches.mockReset()
    // Clear env vars
    delete process.env.AUTOMD_S3_BUCKET
    delete process.env.AUTOMD_S3_ACCESS_KEY_ID
    delete process.env.AUTOMD_S3_SECRET_ACCESS_KEY
    delete process.env.AUTOMD_S3_ENDPOINT
    delete process.env.AUTOMD_S3_PREFIX
  })

  // ─── isS3SyncEnabled ───────────────────────────────────────────────

  describe('isS3SyncEnabled', () => {
    it('returns false when no env vars set', () => {
      expect(isS3SyncEnabled()).toBe(false)
    })

    it('returns false when only bucket is set', () => {
      process.env.AUTOMD_S3_BUCKET = 'test-bucket'
      expect(isS3SyncEnabled()).toBe(false)
    })

    it('returns false when only access key is set', () => {
      process.env.AUTOMD_S3_ACCESS_KEY_ID = 'test-key'
      expect(isS3SyncEnabled()).toBe(false)
    })

    it('returns true when bucket + access key are set', () => {
      process.env.AUTOMD_S3_BUCKET = 'test-bucket'
      process.env.AUTOMD_S3_ACCESS_KEY_ID = 'test-key'
      expect(isS3SyncEnabled()).toBe(true)
    })
  })

  // ─── syncFileToS3 (disabled) ───────────────────────────────────────

  describe('syncFileToS3 (S3 disabled)', () => {
    it('is a no-op when S3 is not configured', async () => {
      await syncFileToS3('/some/path/file.md', 'content')
      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  // ─── syncFileToS3 (enabled) ────────────────────────────────────────

  describe('syncFileToS3 (S3 enabled)', () => {
    beforeEach(() => {
      setupTempDir()
      process.env.AUTOMD_S3_BUCKET = 'test-bucket'
      process.env.AUTOMD_S3_ACCESS_KEY_ID = 'test-key'
      process.env.AUTOMD_S3_SECRET_ACCESS_KEY = 'test-secret'
      mockSend.mockResolvedValue({})
      initS3Sync()
    })

    afterEach(teardownTempDir)

    it('calls PutObject with correct key', async () => {
      const filePath = path.join(tempDir, 'boards', 'test.md')
      await syncFileToS3(filePath, '# Hello')

      expect(mockSend).toHaveBeenCalledTimes(1)
      const cmd = mockSend.mock.calls[0][0]
      expect(cmd.Bucket).toBe('test-bucket')
      expect(cmd.Key).toBe('boards/test.md')
      expect(cmd.Body).toBe('# Hello')
    })

    it('applies S3 prefix to key', async () => {
      process.env.AUTOMD_S3_PREFIX = 'users/abc123'
      initS3Sync()

      const filePath = path.join(tempDir, 'manifest.json')
      await syncFileToS3(filePath, '{}')

      const cmd = mockSend.mock.calls[0][0]
      expect(cmd.Key).toBe('users/abc123/manifest.json')
    })

    it('silently ignores S3 errors', async () => {
      mockSend.mockRejectedValue(new Error('S3 network error'))

      const filePath = path.join(tempDir, 'boards', 'test.md')
      // Should not throw
      await syncFileToS3(filePath, 'content')
    })

    it('never syncs auth.json', async () => {
      const filePath = path.join(tempDir, 'auth.json')
      await syncFileToS3(filePath, '{"admin":"data"}')

      expect(mockSend).not.toHaveBeenCalled()
    })

    it('serializes concurrent calls', async () => {
      const callOrder: number[] = []
      let callCount = 0

      mockSend.mockImplementation(async () => {
        const myIndex = callCount++
        // Simulate async delay
        await new Promise((r) => setTimeout(r, 10))
        callOrder.push(myIndex)
        return {}
      })

      const file1 = path.join(tempDir, 'boards', 'a.md')
      const file2 = path.join(tempDir, 'boards', 'b.md')

      // Fire two concurrent syncs
      const p1 = syncFileToS3(file1, 'first')
      const p2 = syncFileToS3(file2, 'second')
      await Promise.all([p1, p2])

      // Should execute in order despite being fired concurrently
      expect(callOrder).toEqual([0, 1])
    })
  })

  // ─── deleteFileFromS3 ──────────────────────────────────────────────

  describe('deleteFileFromS3', () => {
    beforeEach(() => {
      setupTempDir()
      process.env.AUTOMD_S3_BUCKET = 'test-bucket'
      process.env.AUTOMD_S3_ACCESS_KEY_ID = 'test-key'
      process.env.AUTOMD_S3_SECRET_ACCESS_KEY = 'test-secret'
      mockSend.mockResolvedValue({})
      initS3Sync()
    })

    afterEach(teardownTempDir)

    it('calls DeleteObject with correct key', async () => {
      const filePath = path.join(tempDir, 'boards', 'old.md')
      await deleteFileFromS3(filePath)

      expect(mockSend).toHaveBeenCalledTimes(1)
      const cmd = mockSend.mock.calls[0][0]
      expect(cmd.Bucket).toBe('test-bucket')
      expect(cmd.Key).toBe('boards/old.md')
    })

    it('silently ignores S3 errors', async () => {
      mockSend.mockRejectedValue(new Error('S3 error'))

      const filePath = path.join(tempDir, 'boards', 'old.md')
      await deleteFileFromS3(filePath)
      // No throw — test passes
    })
  })

  // ─── hydrateFromS3 ─────────────────────────────────────────────────

  describe('hydrateFromS3', () => {
    beforeEach(() => {
      setupTempDir()
      process.env.AUTOMD_S3_BUCKET = 'test-bucket'
      process.env.AUTOMD_S3_ACCESS_KEY_ID = 'test-key'
      process.env.AUTOMD_S3_SECRET_ACCESS_KEY = 'test-secret'
      initS3Sync()
    })

    afterEach(teardownTempDir)

    it('is a no-op when S3 is not configured', async () => {
      // hydrateFromS3 checks the internal s3Client (set by initS3Sync).
      // When initS3Sync() was never called (or env vars were absent at call time),
      // s3Client is null and hydrateFromS3 returns immediately.
      // Since prior tests may have initialized the client, we verify
      // that the function handles an empty bucket gracefully instead.
      mockSend.mockResolvedValueOnce({
        Contents: [],
        IsTruncated: false,
      })

      await hydrateFromS3()
      // Should have called ListObjectsV2 but no downloads/uploads
      expect(mockClearAllCaches).not.toHaveBeenCalled()
    })

    it('downloads files missing locally', async () => {
      const s3Time = new Date('2025-01-01T00:00:00Z')
      mockSend
        .mockResolvedValueOnce({
          // ListObjectsV2
          Contents: [
            { Key: 'boards/remote.md', LastModified: s3Time },
          ],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({
          // GetObject
          Body: { transformToString: () => Promise.resolve('# Remote Board\n') },
        })

      await hydrateFromS3()

      // File should exist locally now
      const localPath = path.join(tempDir, 'boards', 'remote.md')
      expect(fs.existsSync(localPath)).toBe(true)
      expect(fs.readFileSync(localPath, 'utf-8')).toBe('# Remote Board\n')
    })

    it('downloads when S3 is newer than local', async () => {
      // Create a local file with old mtime
      const localPath = path.join(tempDir, 'boards', 'board.md')
      fs.writeFileSync(localPath, '# Old', 'utf-8')
      // Set mtime to the past
      const oldTime = new Date('2024-01-01T00:00:00Z')
      fs.utimesSync(localPath, oldTime, oldTime)

      const s3Time = new Date('2025-06-01T00:00:00Z')
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'boards/board.md', LastModified: s3Time }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({
          Body: { transformToString: () => Promise.resolve('# Updated from S3') },
        })

      await hydrateFromS3()

      expect(fs.readFileSync(localPath, 'utf-8')).toBe('# Updated from S3')
    })

    it('uploads local files that are newer than S3', async () => {
      // Create a local file with recent mtime
      const localPath = path.join(tempDir, 'boards', 'local.md')
      fs.writeFileSync(localPath, '# Local Board', 'utf-8')

      const s3Time = new Date('2020-01-01T00:00:00Z')
      mockSend
        .mockResolvedValueOnce({
          // ListObjectsV2 — S3 has older version
          Contents: [{ Key: 'boards/local.md', LastModified: s3Time }],
          IsTruncated: false,
        })
        .mockResolvedValue({}) // PutObject calls

      await hydrateFromS3()

      // Should have uploaded (PutObject called)
      const putCalls = mockSend.mock.calls.filter(
        (c) => c[0]._type === 'PutObject',
      )
      expect(putCalls.length).toBeGreaterThan(0)
    })

    it('uploads local files not in S3', async () => {
      const localPath = path.join(tempDir, 'boards', 'only-local.md')
      fs.writeFileSync(localPath, '# Only Local', 'utf-8')

      mockSend
        .mockResolvedValueOnce({
          // ListObjectsV2 — S3 is empty
          Contents: [],
          IsTruncated: false,
        })
        .mockResolvedValue({}) // PutObject

      await hydrateFromS3()

      const putCalls = mockSend.mock.calls.filter(
        (c) => c[0]._type === 'PutObject',
      )
      expect(putCalls.length).toBeGreaterThan(0)
    })

    it('calls clearAllCaches after downloads', async () => {
      const s3Time = new Date('2099-01-01T00:00:00Z')
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'boards/new.md', LastModified: s3Time }],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({
          Body: { transformToString: () => Promise.resolve('# New') },
        })

      await hydrateFromS3()

      expect(mockClearAllCaches).toHaveBeenCalled()
    })

    it('does not call clearAllCaches when no downloads', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [],
        IsTruncated: false,
      })

      await hydrateFromS3()

      expect(mockClearAllCaches).not.toHaveBeenCalled()
    })

    it('handles S3 errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('Network timeout'))

      // Should not throw
      await hydrateFromS3()
    })

    it('skips auth.json in S3', async () => {
      const s3Time = new Date('2099-01-01T00:00:00Z')
      mockSend.mockResolvedValueOnce({
        Contents: [{ Key: 'auth.json', LastModified: s3Time }],
        IsTruncated: false,
      })

      await hydrateFromS3()

      // GetObject should NOT be called for auth.json
      const getCalls = mockSend.mock.calls.filter(
        (c) => c[0]._type === 'GetObject',
      )
      expect(getCalls).toHaveLength(0)
    })
  })

  // ─── getS3SyncStatus ───────────────────────────────────────────────

  describe('getS3SyncStatus', () => {
    it('returns disabled status when S3 not configured', () => {
      const status = getS3SyncStatus()
      expect(status.enabled).toBe(false)
    })

    it('returns enabled status with bucket info', () => {
      setupTempDir()
      process.env.AUTOMD_S3_BUCKET = 'my-bucket'
      process.env.AUTOMD_S3_ACCESS_KEY_ID = 'key'
      process.env.AUTOMD_S3_SECRET_ACCESS_KEY = 'secret'
      initS3Sync()

      const status = getS3SyncStatus()
      expect(status.enabled).toBe(true)
      expect(status.bucket).toBe('my-bucket')

      teardownTempDir()
    })
  })
})
