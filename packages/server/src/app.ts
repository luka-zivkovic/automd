import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.js'
import { filesRouter } from './routes/files.js'
import { tasksRouter } from './routes/tasks.js'
import { columnsRouter } from './routes/columns.js'
import { projectsRouter } from './routes/projects.js'
import { contextRouter } from './routes/context.js'
import { webhooksRouter } from './routes/webhooks.js'
import { tagsRouter } from './routes/tags.js'
import { settingsRouter } from './routes/settings.js'
import { searchRouter } from './routes/search.js'
import { relationshipsRouter } from './routes/relationships.js'
import { getStoragePath, StorageError } from './storage.js'
import { getUpdateInfo } from './update-check.js'
import { requireAuth } from './auth-middleware.js'
import { isSetupComplete, isAuthDisabled } from './auth-storage.js'
import { getS3SyncStatus } from './s3-sync.js'
import { getEmbeddingsStatus } from './embeddings/index.js'
import { countRelationships } from './relationships.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createApp() {
  const app = express()
  const allowedOrigin = process.env.AUTOMD_CORS_ORIGIN || 'http://localhost:5173'
  app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin }))
  app.use(express.json({ limit: '5mb' }))

  // Public endpoints (no auth required)
  app.get('/api/health', (_req, res) => {
    let relationships
    try { relationships = countRelationships() } catch { relationships = null }

    res.json({
      status: 'ok',
      storage: 'ok',
      authRequired: isSetupComplete() && !isAuthDisabled(),
      s3: getS3SyncStatus(),
      embeddings: getEmbeddingsStatus(),
      relationships,
    })
  })

  app.get('/api/version', (_req, res) => {
    res.json(getUpdateInfo())
  })

  // Auth routes (handle their own auth checks internally)
  app.use('/api/auth', authRouter)

  // Auth middleware — protects all routes below
  app.use('/api', requireAuth)

  // Protected routes
  app.use('/api/files', filesRouter)
  app.use('/api/files/:fileId/tasks', tasksRouter)
  app.use('/api/files/:fileId/columns', columnsRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/context', contextRouter)
  app.use('/api/tags', tagsRouter)
  app.use('/api/webhooks', webhooksRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api/search', searchRouter)
  app.use('/api/relationships', relationshipsRouter)

  // In production, serve the Vite-built frontend as static files
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.resolve(__dirname, '../../../client')
    app.use(express.static(clientDist))
    // SPA fallback: serve index.html for all non-API routes
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'))
    })
  }

  // Error handling middleware
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[server] Unhandled error:', err)

    if (err instanceof StorageError) {
      res.status(500).json({ error: 'Storage operation failed', detail: err.message })
      return
    }

    // Express body-parser errors (e.g., malformed JSON, body too large)
    if ('type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON in request body' })
      return
    }
    if ('type' in err && (err as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'Request body too large' })
      return
    }

    res.status(500).json({ error: 'Internal server error' })
  }
  app.use(errorHandler)

  return app
}
