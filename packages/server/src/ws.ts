import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'

export interface BroadcastEvent {
  type: string
  payload: unknown
}

let wss: WebSocketServer | null = null

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    console.log('[ws] Client connected')

    ws.on('close', () => {
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
