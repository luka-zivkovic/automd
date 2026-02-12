import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createServer, type Server } from 'node:http'
import { createApp } from '../app.js'
import { setupWebSocket } from '../ws.js'
import { clearAllCaches } from '../board-cache.js'

let counter = 0

/**
 * Create an isolated test environment with a temp storage directory
 * and an Express + WebSocket server on an ephemeral port.
 */
export async function createTestEnv() {
  // Create isolated temp storage
  const tempDir = path.join(os.tmpdir(), `automd-test-${Date.now()}-${counter++}`)
  fs.mkdirSync(tempDir, { recursive: true })
  process.env.AUTOMD_STORAGE_DIR = tempDir

  // Create app and server on ephemeral port
  const app = createApp()
  const server = createServer(app)
  setupWebSocket(server)

  const port = await new Promise<number>((resolve) => {
    server.listen(0, () => {
      const addr = server.address()
      resolve(typeof addr === 'object' && addr ? addr.port : 0)
    })
  })

  const cleanup = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
    clearAllCaches()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failures
    }
    delete process.env.AUTOMD_STORAGE_DIR
  }

  return { app, server, port, cleanup }
}

export const SAMPLE_MARKDOWN = `# Todo

## Task 1

## Task 2

# Done

## [x] Task 3
`
