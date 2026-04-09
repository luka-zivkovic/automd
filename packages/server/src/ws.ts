import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import { isAuthDisabled, isSetupComplete, validateCredential, getIdentityFromCredential } from './auth-storage.js'

export interface BroadcastEvent {
  type: string
  payload: unknown
}

interface ClientInfo {
  username: string
  connectedAt: number
}

let wss: WebSocketServer | null = null
const clients = new Map<WebSocket, ClientInfo>()

function broadcastPresence() {
  const agents = Array.from(clients.values())
  broadcast({ type: 'presence:list', payload: { agents } })
}

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, callback) => {
      if (isAuthDisabled() || !isSetupComplete()) {
        ;(info.req as any)._automdIdentity = 'anonymous'
        callback(true)
        return
      }

      // Try Authorization header first (preferred — not logged by proxies)
      const authHeader = info.req.headers['authorization']
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const headerToken = authHeader.slice(7)
        if (validateCredential(headerToken)) {
          ;(info.req as any)._automdIdentity = getIdentityFromCredential(headerToken) ?? 'authenticated'
          callback(true)
          return
        }
      }

      // Fall back to query parameter (legacy, visible in server/proxy logs)
      const url = new URL(info.req.url || '', `http://${info.req.headers.host ?? 'localhost'}`)
      const token = url.searchParams.get('token')

      if (token && validateCredential(token)) {
        ;(info.req as any)._automdIdentity = getIdentityFromCredential(token) ?? 'authenticated'
        callback(true)
        return
      }

      callback(false, 401, 'Unauthorized')
    },
  })

  // Ping every 30s to keep connections alive through reverse proxies (Traefik, nginx, etc.)
  const PING_INTERVAL = 30_000
  const aliveClients = new Set<WebSocket>()

  const heartbeat = setInterval(() => {
    if (!wss) return
    for (const ws of wss.clients) {
      if (!aliveClients.has(ws)) {
        // Pong not received since last ping — connection is dead
        ws.terminate()
        continue
      }
      aliveClients.delete(ws)
      ws.ping()
    }
  }, PING_INTERVAL)

  wss.on('close', () => clearInterval(heartbeat))

  wss.on('connection', (ws, req) => {
    const serverIdentity = (req as any)._automdIdentity || 'anonymous'
    console.log('[ws] Client connected')
    aliveClients.add(ws)

    ws.on('pong', () => {
      aliveClients.add(ws)
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'presence:join') {
          // Use server-verified identity when auth is enabled, not client-supplied username
          clients.set(ws, {
            username: serverIdentity !== 'anonymous' ? serverIdentity : (msg.payload?.username || 'Anonymous'),
            connectedAt: Date.now(),
          })
          broadcastPresence()
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      aliveClients.delete(ws)
      clients.delete(ws)
      broadcastPresence()
      console.log('[ws] Client disconnected')
    })

    ws.on('error', (err) => {
      console.error('[ws] Error:', err.message)
    })
  })

  console.log('[ws] WebSocket server ready on /ws')
  return wss
}

export function broadcast(event: BroadcastEvent, excludeWs?: WebSocket) {
  if (!wss) return

  const message = JSON.stringify(event)
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}
