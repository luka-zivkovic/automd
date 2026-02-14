import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { filesRouter } from './routes/files.js'
import { tasksRouter } from './routes/tasks.js'
import { columnsRouter } from './routes/columns.js'
import { projectsRouter } from './routes/projects.js'
import { setupWebSocket } from './ws.js'
import { getStoragePath } from './storage.js'

const PORT = parseInt(process.env.AUTOMD_PORT ?? '4800', 10)

const app = express()
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/files', filesRouter)
app.use('/api/files/:fileId/tasks', tasksRouter)
app.use('/api/files/:fileId/columns', columnsRouter)
app.use('/api/projects', projectsRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', storage: getStoragePath() })
})

// Create HTTP server and attach WebSocket
const server = createServer(app)
setupWebSocket(server)

server.listen(PORT, () => {
  console.log(`[automd-server] Running on http://localhost:${PORT}`)
  console.log(`[automd-server] Storage: ${getStoragePath()}`)
  console.log(`[automd-server] WebSocket: ws://localhost:${PORT}/ws`)
})

export { app, server }
