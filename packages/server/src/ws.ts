import crypto from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import { isAuthDisabled, isSetupComplete, validateCredential, getIdentityFromCredential } from './auth-storage.js'

export interface BroadcastEvent {
  type: string
  payload: unknown
  seq?: number
  timestamp?: number
  replayed?: boolean
}

interface ClientInfo {
  username: string
  connectedAt: number
}

let wss: WebSocketServer | null = null
const clients = new Map<WebSocket, ClientInfo>()
const REPLAY_LIMIT = 500
let serverId = crypto.randomUUID()
let nextSeq = 1
let replayLog: Required<Pick<BroadcastEvent, 'type' | 'payload' | 'seq' | 'timestamp'>>[] = []

function shouldReplay(event: BroadcastEvent): boolean {
  return event.type !== 'presence:list'
}

function parseReplayRequest(req: any): { since: number | null; clientServerId: string | null } {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host ?? 'localhost'}`)
    const clientServerId = url.searchParams.get('serverId')
    const raw = url.searchParams.get('since')
    if (!raw) return { since: null, clientServerId }
    const parsed = Number(raw)
    const since = Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    return { since, clientServerId }
  } catch {
    return { since: null, clientServerId: null }
  }
}

function sequenceEvent(event: BroadcastEvent): BroadcastEvent {
  if (!shouldReplay(event)) return event
  const sequenced = { ...event, seq: nextSeq++, timestamp: Date.now() } as Required<Pick<BroadcastEvent, 'type' | 'payload' | 'seq' | 'timestamp'>>
  replayLog.push(sequenced)
  if (replayLog.length > REPLAY_LIMIT) replayLog = replayLog.slice(-REPLAY_LIMIT)
  return sequenced
}

function replayMissedEvents(ws: WebSocket, since: number | null) {
  if (since === null) return
  const lowestSeq = replayLog[0]?.seq
  if (lowestSeq !== undefined && since < lowestSeq - 1) {
    ws.send(JSON.stringify({
      type: 'replay:gap',
      payload: { since, lowestSeq, currentSeq: nextSeq - 1, serverId },
    }))
  }
  const missed = replayLog.filter((event) => event.seq > since)
  for (const event of missed) {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ ...event, replayed: true }))
  }
}

function broadcastPresence() {
  const agents = Array.from(clients.values())
  broadcast({ type: 'presence:list', payload: { agents } })
}

export function setupWebSocket(server: Server): WebSocketServer {
  serverId = crypto.randomUUID()
  replayLog = []
  nextSeq = 1
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
    const replayRequest = parseReplayRequest(req)
    const since = replayRequest.clientServerId && replayRequest.clientServerId !== serverId ? 0 : replayRequest.since
    console.log('[ws] Client connected')
    aliveClients.add(ws)
    ws.send(JSON.stringify({
      type: 'ws:welcome',
      payload: { serverId, currentSeq: nextSeq - 1, replayLimit: REPLAY_LIMIT },
    }))
    replayMissedEvents(ws, since)

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

  const outbound = sequenceEvent(event)
  const message = JSON.stringify(outbound)
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}
