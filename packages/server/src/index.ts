import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { setupWebSocket } from './ws.js'
import { getStoragePath, getStorageSummary } from './storage.js'
import { startUpdateChecker } from './update-check.js'
import { isSetupComplete, isAuthDisabled } from './auth-storage.js'
import { initS3Sync, hydrateFromS3, isS3SyncEnabled } from './s3-sync.js'
import { initEmbeddings, isEmbeddingsEnabled, shutdownEmbeddings } from './embeddings/index.js'
import { closeRelationshipsDb } from './relationships.js'
import { readSettings } from './settings-storage.js'
import { ensureAgentStubsFromTasks, releaseStaleClaims } from './agent-storage.js'

// Load root .env file (pnpm/tsx don't auto-load .env)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../../../.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const PORT = parseInt(process.env.AUTOMD_PORT ?? '4800', 10)
const HOST = process.env.AUTOMD_HOST

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

async function main() {
  if (isAuthDisabled() && HOST && !isLoopbackHost(HOST)) {
    throw new Error('AUTOMD_DISABLE_AUTH=true cannot be used with a non-loopback AUTOMD_HOST')
  }

  // S3: init client (sync) then hydrate (async, blocks startup)
  initS3Sync()
  await hydrateFromS3()

  // Embeddings: init from settings (sync, non-blocking)
  initEmbeddings(readSettings())
  const migratedAgents = ensureAgentStubsFromTasks()

  const app = createApp()

  // Create HTTP server and attach WebSocket
  const server = createServer(app)
  setupWebSocket(server)

  const listenHost = HOST ?? (isAuthDisabled() ? '127.0.0.1' : undefined)
  server.listen(PORT, listenHost, () => {
    const summary = getStorageSummary()
    console.log(`[automd-server] Running on http://${listenHost ?? 'localhost'}:${PORT}`)
    console.log(`[automd-server] Storage: ${getStoragePath()} (${summary.items} items, ${summary.projects} projects)`)
    if (summary.items === 0) {
      console.warn('[automd-server] \u26a0 Storage is empty \u2014 if you expected data, check your volume mounts')
    }
    console.log(`[automd-server] WebSocket: ws://localhost:${PORT}/ws`)
    console.log(`[automd-server] S3 sync: ${isS3SyncEnabled() ? 'enabled' : 'disabled'}`)
    console.log(`[automd-server] Embeddings: ${isEmbeddingsEnabled() ? 'enabled' : 'disabled'}`)
    if (migratedAgents > 0) {
      console.log(`[automd-server] Agents: created ${migratedAgents} archived stub agent(s) from built-by metadata`)
    }

    if (isAuthDisabled()) {
      console.warn('[automd-server] ⚠ Authentication: disabled (AUTOMD_DISABLE_AUTH=true); loopback bind enforced unless AUTOMD_HOST is explicitly safe')
    } else if (isSetupComplete()) {
      console.log('[automd-server] Authentication: enabled')
    } else {
      console.log('[automd-server] Authentication: awaiting admin setup')
    }

    startUpdateChecker()
  })

  const staleClaimInterval = setInterval(() => {
    const released = releaseStaleClaims()
    if (released > 0) console.log(`[automd-server] Released ${released} stale agent claim(s)`)
  }, 5 * 60 * 1000)
  staleClaimInterval.unref()

  // Graceful shutdown: close DBs to avoid WAL corruption
  const shutdown = () => {
    console.log('[automd-server] Shutting down...')
    shutdownEmbeddings()
    clearInterval(staleClaimInterval)
    closeRelationshipsDb()
    server.close(() => process.exit(0))
    // Force exit after 5s if close hangs
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[automd-server] Fatal startup error:', err)
  process.exit(1)
})
