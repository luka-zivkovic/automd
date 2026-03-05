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

async function main() {
  // S3: init client (sync) then hydrate (async, blocks startup)
  initS3Sync()
  await hydrateFromS3()

  const app = createApp()

  // Create HTTP server and attach WebSocket
  const server = createServer(app)
  setupWebSocket(server)

  server.listen(PORT, () => {
    const summary = getStorageSummary()
    console.log(`[automd-server] Running on http://localhost:${PORT}`)
    console.log(`[automd-server] Storage: ${getStoragePath()} (${summary.items} items, ${summary.projects} projects)`)
    if (summary.items === 0) {
      console.warn('[automd-server] \u26a0 Storage is empty \u2014 if you expected data, check your volume mounts')
    }
    console.log(`[automd-server] WebSocket: ws://localhost:${PORT}/ws`)
    console.log(`[automd-server] S3 sync: ${isS3SyncEnabled() ? 'enabled' : 'disabled'}`)

    if (isAuthDisabled()) {
      console.log('[automd-server] Authentication: disabled (AUTOMD_DISABLE_AUTH=true)')
    } else if (isSetupComplete()) {
      console.log('[automd-server] Authentication: enabled')
    } else {
      console.log('[automd-server] Authentication: awaiting admin setup')
    }

    startUpdateChecker()
  })
}

main().catch((err) => {
  console.error('[automd-server] Fatal startup error:', err)
  process.exit(1)
})
