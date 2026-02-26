import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import { isAuthDisabled, isSetupComplete, validateCredential } from './auth-storage.js'

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
        callback(true)
        return
      }

      const url = new URL(info.req.url || '', `http://${info.req.headers.host ?? 'localhost'}`)
      const token = url.searchParams.get('token')

      if (!token || !validateCredential(token)) {
        callback(false, 401, 'Unauthorized')
        return
      }

      callback(true)
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

  wss.on('connection', (ws) => {
    console.log('[ws] Client connected')
    aliveClients.add(ws)

    ws.on('pong', () => {
      aliveClients.add(ws)
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'presence:join' && typeof msg.payload?.username === 'string') {
          clients.set(ws, {
            username: msg.payload.username || 'Anonymous',
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
