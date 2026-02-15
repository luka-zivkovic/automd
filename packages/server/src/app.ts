import express, { type ErrorRequestHandler } from 'express'
import cors from 'cors'
import { filesRouter } from './routes/files.js'
import { tasksRouter } from './routes/tasks.js'
import { columnsRouter } from './routes/columns.js'
import { projectsRouter } from './routes/projects.js'
import { getStoragePath, StorageError } from './storage.js'

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '5mb' }))

  // Routes
  app.use('/api/files', filesRouter)
  app.use('/api/files/:fileId/tasks', tasksRouter)
  app.use('/api/files/:fileId/columns', columnsRouter)
  app.use('/api/projects', projectsRouter)

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', storage: getStoragePath() })
  })

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
