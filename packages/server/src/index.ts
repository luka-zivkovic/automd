import { createServer } from 'node:http'
import { createApp } from './app.js'
import { setupWebSocket } from './ws.js'
import { getStoragePath } from './storage.js'
import { startUpdateChecker } from './update-check.js'

const PORT = parseInt(process.env.AUTOMD_PORT ?? '4800', 10)

const app = createApp()

// Create HTTP server and attach WebSocket
const server = createServer(app)
setupWebSocket(server)

server.listen(PORT, () => {
  console.log(`[automd-server] Running on http://localhost:${PORT}`)
  console.log(`[automd-server] Storage: ${getStoragePath()}`)
  console.log(`[automd-server] WebSocket: ws://localhost:${PORT}/ws`)
  startUpdateChecker()
})

export { app, server }
