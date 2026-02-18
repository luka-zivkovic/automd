import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'

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
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    console.log('[ws] Client connected')

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
