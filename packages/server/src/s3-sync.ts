/**
 * S3 Storage Sync — write-behind observer + startup hydration.
 *
 * Every successful local write fires an async S3 upload. S3 failures
 * never block local operations. On startup, local state is reconciled
 * with S3 (bidirectional — newer wins).
 *
 * Disabled when AUTOMD_S3_BUCKET or AUTOMD_S3_ACCESS_KEY_ID are absent.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import fs from 'node:fs'
import path from 'node:path'
import { getAutomdDir } from './config.js'
import { clearAllCaches } from './board-cache.js'

// ─── State ────────────────────────────────────────────────────────────────

let s3Client: S3Client | null = null
let bucket: string | null = null
let prefix = ''
let lastSyncAt: number | null = null
let syncErrorCount = 0

// Promise-chain queue (same pattern as write-lock.ts)
let syncQueue: Promise<void> = Promise.resolve()

// ─── Public: lifecycle ────────────────────────────────────────────────────

export function isS3SyncEnabled(): boolean {
  return !!(process.env.AUTOMD_S3_BUCKET && process.env.AUTOMD_S3_ACCESS_KEY_ID)
}

export function initS3Sync(): void {
  if (!isS3SyncEnabled()) return

  bucket = process.env.AUTOMD_S3_BUCKET!
  prefix = (process.env.AUTOMD_S3_PREFIX ?? '').replace(/\/+$/, '') // strip trailing slash

  s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.AUTOMD_S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.AUTOMD_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AUTOMD_S3_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: !!process.env.AUTOMD_S3_ENDPOINT, // required for R2/MinIO
  })

  console.log(`[s3-sync] Enabled — bucket: ${bucket}, prefix: "${prefix}"`)
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function toS3Key(localPath: string): string {
  const rel = path.relative(getAutomdDir(), localPath).replace(/\\/g, '/')
  return prefix ? `${prefix}/${rel}` : rel
}

function fromS3Key(key: string): string {
  const rel = prefix ? key.slice(prefix.length + 1) : key
  return path.join(getAutomdDir(), rel)
}

function enqueue(op: () => Promise<void>): Promise<void> {
  const next = syncQueue.then(op, op)
  syncQueue = next.then(
    () => {},
    () => {},
  )
  return next
}

// ─── Public: write-behind sync ────────────────────────────────────────────

export function syncFileToS3(localPath: string, content: string): Promise<void> {
  if (!s3Client || !bucket) return Promise.resolve()
  if (localPath.endsWith('auth.json')) return Promise.resolve()

  const key = toS3Key(localPath)
  return enqueue(async () => {
    try {
      await s3Client!.send(
        new PutObjectCommand({
          Bucket: bucket!,
          Key: key,
          Body: content,
          ContentType: localPath.endsWith('.json') ? 'application/json' : 'text/markdown',
        }),
      )
      lastSyncAt = Date.now()
    } catch (err) {
      syncErrorCount++
      console.error(`[s3-sync] Upload failed (${key}):`, err)
    }
  })
}

export function deleteFileFromS3(localPath: string): Promise<void> {
  if (!s3Client || !bucket) return Promise.resolve()

  const key = toS3Key(localPath)
  return enqueue(async () => {
    try {
      await s3Client!.send(
        new DeleteObjectCommand({
          Bucket: bucket!,
          Key: key,
        }),
      )
      lastSyncAt = Date.now()
    } catch (err) {
      syncErrorCount++
      console.error(`[s3-sync] Delete failed (${key}):`, err)
    }
  })
}

// ─── Public: startup hydration ────────────────────────────────────────────

export async function hydrateFromS3(): Promise<void> {
  if (!s3Client || !bucket) return

  console.log('[s3-sync] Starting hydration…')
  const automdDir = getAutomdDir()
  const boardsDir = path.join(automdDir, 'boards')
  fs.mkdirSync(boardsDir, { recursive: true })

  try {
    // 1. List all S3 objects under prefix
    const s3Objects = new Map<string, Date>()
    let continuationToken: string | undefined

    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
        }),
      )
      for (const obj of response.Contents ?? []) {
        if (obj.Key && obj.LastModified) {
          s3Objects.set(obj.Key, obj.LastModified)
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    let downloadCount = 0

    // 2. For each S3 object: download if S3 is newer or local is missing
    for (const [key, s3LastModified] of s3Objects) {
      const localPath = fromS3Key(key)
      if (localPath.endsWith('auth.json')) continue

      let shouldDownload = false
      if (!fs.existsSync(localPath)) {
        shouldDownload = true
      } else {
        const localMtime = fs.statSync(localPath).mtimeMs
        // 1-second tolerance for S3 timestamp rounding
        shouldDownload = s3LastModified.getTime() - localMtime > 1000
      }

      if (shouldDownload) {
        const result = await s3Client.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        )
        const body = (await result.Body?.transformToString('utf-8')) ?? ''
        fs.mkdirSync(path.dirname(localPath), { recursive: true })
        fs.writeFileSync(localPath, body, 'utf-8')
        downloadCount++
        console.log(`[s3-sync] Downloaded: ${path.relative(automdDir, localPath)}`)
      }
    }

    // 3. Upload local files that are newer or missing from S3
    const localFiles = [
      ...(fs.existsSync(path.join(automdDir, 'manifest.json'))
        ? [path.join(automdDir, 'manifest.json')]
        : []),
      ...(fs.existsSync(boardsDir)
        ? fs.readdirSync(boardsDir).map((f) => path.join(boardsDir, f))
        : []),
    ]

    let uploadCount = 0
    for (const localPath of localFiles) {
      if (!fs.statSync(localPath).isFile()) continue
      const key = toS3Key(localPath)
      const s3LastModified = s3Objects.get(key)
      const localMtime = fs.statSync(localPath).mtimeMs

      const shouldUpload =
        !s3LastModified || localMtime - s3LastModified.getTime() > 1000

      if (shouldUpload) {
        const content = fs.readFileSync(localPath, 'utf-8')
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: content,
            ContentType: localPath.endsWith('.json') ? 'application/json' : 'text/markdown',
          }),
        )
        uploadCount++
        console.log(`[s3-sync] Uploaded: ${path.relative(automdDir, localPath)}`)
      }
    }

    // 4. Invalidate board cache if any files were downloaded
    if (downloadCount > 0) {
      clearAllCaches()
    }

    lastSyncAt = Date.now()
    console.log(
      `[s3-sync] Hydration complete — ${downloadCount} downloaded, ${uploadCount} uploaded`,
    )
  } catch (err) {
    syncErrorCount++
    console.error('[s3-sync] Hydration failed (continuing with local state):', err)
  }
}

// ─── Public: status ───────────────────────────────────────────────────────

export function getS3SyncStatus() {
  return {
    enabled: isS3SyncEnabled(),
    bucket: bucket ?? undefined,
    lastSyncAt,
    errorCount: syncErrorCount,
  }
}
