import crypto from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'node:http'
import { isAuthDisabled, isSetupComplete, isSetupLockedWithoutAuth, validateCredential, getIdentityFromCredential } from './auth-storage.js'

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

interface ClientAuth {
  authenticated: boolean
  identity: string
}

let wss: WebSocketServer | null = null
const clients = new Map<WebSocket, ClientInfo>()
const clientAuth = new Map<WebSocket, ClientAuth>()
const REPLAY_LIMIT = 500
const HANDSHAKE_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 100 : 2_000
const MAX_PENDING_HANDSHAKES = 100
const MAX_PENDING_HANDSHAKES_PER_IP = 20
let serverId = crypto.randomUUID()
let nextSeq = 1
let replayLog: Required<Pick<BroadcastEvent, 'type' | 'payload' | 'seq' | 'timestamp'>>[] = []
let pendingHandshakeCount = 0
const pendingHandshakesByIp = new Map<string, number>()

function shouldReplay(event: BroadcastEvent): boolean {
  return event.type !== 'presence:list'
}

function isAuthRequired(): boolean {
  return !isAuthDisabled() && isSetupComplete()
}

function isAuthorized(ws: WebSocket): boolean {
  return clientAuth.get(ws)?.authenticated === true
}

function remoteAddress(req: any): string {
  return req?.socket?.remoteAddress ?? 'unknown'
}

function canAcceptPendingHandshake(ip: string): boolean {
  return pendingHandshakeCount < MAX_PENDING_HANDSHAKES &&
    (pendingHandshakesByIp.get(ip) ?? 0) < MAX_PENDING_HANDSHAKES_PER_IP
}

function trackPendingHandshake(ip: string): () => void {
  pendingHandshakeCount++
  pendingHandshakesByIp.set(ip, (pendingHandshakesByIp.get(ip) ?? 0) + 1)
  let released = false

  return () => {
    if (released) return
    released = true
    pendingHandshakeCount = Math.max(0, pendingHandshakeCount - 1)
    const nextCount = (pendingHandshakesByIp.get(ip) ?? 1) - 1
    if (nextCount <= 0) pendingHandshakesByIp.delete(ip)
    else pendingHandshakesByIp.set(ip, nextCount)
  }
}

function parseReplayPayload(payload: unknown): { since: number | null; clientServerId: string | null } {
  if (!payload || typeof payload !== 'object') return { since: null, clientServerId: null }
  const data = payload as Record<string, unknown>
  const parsed = data.since === undefined || data.since === null
    ? Number.NaN
    : typeof data.since === 'number' ? data.since : Number(data.since)
  const since = Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  const clientServerId = typeof data.serverId === 'string' ? data.serverId : null
  return { since, clientServerId }
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

function sendWelcomeAndReplay(ws: WebSocket, replayRequest: { since: number | null; clientServerId: string | null }) {
  if (ws.readyState !== WebSocket.OPEN) return
  const since = replayRequest.clientServerId && replayRequest.clientServerId !== serverId ? 0 : replayRequest.since
  ws.send(JSON.stringify({
    type: 'ws:welcome',
    payload: { serverId, currentSeq: nextSeq - 1, replayLimit: REPLAY_LIMIT },
  }))
  replayMissedEvents(ws, since)
}

function updatePresence(ws: WebSocket, identity: string, requestedUsername: unknown) {
  if (!isAuthorized(ws)) return
  const username = isAuthRequired()
    ? identity
    : (typeof requestedUsername === 'string' && requestedUsername.trim() ? requestedUsername : 'Anonymous')
  clients.set(ws, {
    username,
    connectedAt: Date.now(),
  })
  broadcastPresence()
}

function broadcastPresence() {
  const agents = Array.from(clients.values())
  broadcast({ type: 'presence:list', payload: { agents } })
}

export function setupWebSocket(server: Server): WebSocketServer {
  serverId = crypto.randomUUID()
  replayLog = []
  nextSeq = 1
  clients.clear()
  clientAuth.clear()
  pendingHandshakeCount = 0
  pendingHandshakesByIp.clear()
  wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info, callback) => {
      if (isAuthDisabled()) {
        ;(info.req as any)._automdIdentity = 'anonymous'
        ;(info.req as any)._automdAuthenticated = true
        callback(true)
        return
      }

      if (isSetupLockedWithoutAuth()) {
        callback(false, 503, 'Authentication data missing')
        return
      }

      if (!isSetupComplete()) {
        ;(info.req as any)._automdIdentity = 'anonymous'
        ;(info.req as any)._automdAuthenticated = true
        callback(true)
        return
      }

      // Try Authorization header first (preferred — not logged by proxies)
      const authHeader = info.req.headers['authorization']
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const headerToken = authHeader.slice(7)
        if (validateCredential(headerToken)) {
          ;(info.req as any)._automdIdentity = getIdentityFromCredential(headerToken) ?? 'authenticated'
          ;(info.req as any)._automdAuthenticated = true
          callback(true)
          return
        }
      }

      const ip = remoteAddress(info.req)
      if (!canAcceptPendingHandshake(ip)) {
        callback(false, 429, 'Too many pending handshakes')
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

  wss.on('connection', (ws, req) => {
    const serverIdentity = (req as any)._automdIdentity || 'anonymous'
    const authenticated = (req as any)._automdAuthenticated === true
    console.log('[ws] Client connected')
    aliveClients.add(ws)
    clientAuth.set(ws, { authenticated, identity: serverIdentity })
    let helloAccepted = false
    const releasePendingHandshake = !authenticated && isAuthRequired()
      ? trackPendingHandshake(remoteAddress(req))
      : null
    const authTimeout = !authenticated && isAuthRequired()
      ? setTimeout(() => {
        if (!isAuthorized(ws) && ws.readyState === WebSocket.OPEN) {
          ws.close(1008, 'Unauthorized')
        }
      }, HANDSHAKE_TIMEOUT_MS)
      : null
    authTimeout?.unref()

    ws.on('pong', () => {
      aliveClients.add(ws)
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'ws:hello') {
          if (helloAccepted) return
          const payload = msg.payload ?? {}
          const state = clientAuth.get(ws) ?? { authenticated: false, identity: 'anonymous' }
          let identity = state.identity

          if (!state.authenticated) {
            const token = typeof payload.token === 'string' ? payload.token : ''
            if (isAuthRequired()) {
              if (!validateCredential(token)) {
                ws.send(JSON.stringify({ type: 'ws:error', payload: { error: 'Authentication required.' } }))
                ws.close(1008, 'Unauthorized')
                return
              }
              identity = getIdentityFromCredential(token) ?? 'authenticated'
            }
            clientAuth.set(ws, { authenticated: true, identity })
            if (authTimeout) clearTimeout(authTimeout)
            releasePendingHandshake?.()
          }

          helloAccepted = true
          sendWelcomeAndReplay(ws, parseReplayPayload(payload))
          if (payload.username !== undefined) {
            updatePresence(ws, identity, payload.username)
          }
          return
        }

        if (!isAuthorized(ws)) {
          ws.close(1008, 'Unauthorized')
          return
        }

        if (msg.type === 'presence:join') {
          // Use server-verified identity when auth is enabled, not client-supplied username
          const state = clientAuth.get(ws)
          updatePresence(ws, state?.identity ?? 'anonymous', msg.payload?.username)
        }
      } catch {
        if (!isAuthorized(ws)) {
          ws.close(1008, 'Unauthorized')
        }
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      if (authTimeout) clearTimeout(authTimeout)
      releasePendingHandshake?.()
      aliveClients.delete(ws)
      clients.delete(ws)
      clientAuth.delete(ws)
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
    if (client !== excludeWs && client.readyState === WebSocket.OPEN && isAuthorized(client)) {
      client.send(message)
    }
  }
}
