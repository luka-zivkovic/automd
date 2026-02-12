import { createServer } from 'node:http'
import { createApp } from './app.js'
import { setupWebSocket } from './ws.js'
import { getStoragePath } from './storage.js'
import { startUpdateChecker } from './update-check.js'
import { isSetupComplete, isAuthDisabled } from './auth-storage.js'
import { initS3Sync, hydrateFromS3, isS3SyncEnabled } from './s3-sync.js'

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
    console.log(`[automd-server] Running on http://localhost:${PORT}`)
    console.log(`[automd-server] Storage: ${getStoragePath()}`)
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
