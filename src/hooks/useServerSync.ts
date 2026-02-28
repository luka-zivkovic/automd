import { useEffect, useRef } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useDocumentStore } from '@/store/document-store'
import { useConnectionStore } from '@/store/connection-store'
import { useUserStore } from '@/store/user-store'
import { useAuthStore } from '@/store/auth-store'
import { useActivityStore } from '@/store/activity-store'
import type { BoardFile, Project } from '@/lib/markdown/types'
import { toast } from 'sonner'
import { apiFetch, WS_BASE, HAS_SERVER } from '@/lib/api'

/**
 * Syncs the web app with automd-server.
 * Disabled when VITE_LOCAL_ONLY=true (local-only mode with localStorage).
 *
 * Features:
 * - Presence protocol (8A): sends username on connect, receives agent list
 * - Loading & error states (8B): loading skeleton, error toasts with retry, optimistic rollback
 * - Activity events (8C): pushes human-readable events to the activity store
 */
export function useServerSync() {
  const authToken = useAuthStore((s) => s.token)
  const authStatus = useAuthStore((s) => s.status)
  const wsRef = useRef<WebSocket | null>(null)
  const isServerUpdateRef = useRef(false)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)
  const mountedRef = useRef(true)
  const hasLoadedOnceRef = useRef(false)
  const confirmedMarkdownRef = useRef<Map<string, string>>(new Map())
  const saveDebouncerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!HAS_SERVER) return // Local-only mode

    // Don't connect until auth is resolved
    if (authStatus !== 'authenticated') return

    mountedRef.current = true

    // --- 1. Initial fetch: load files + projects from server ---
    // background=true skips skeleton (used on reconnect when data already loaded)
    async function loadFromServer(background = false) {
      if (!background) {
        useConnectionStore.getState().setLoading(true)
      }
      useConnectionStore.getState().setError(null)

      const [filesResult, projectsResult] = await Promise.all([
        apiFetch<Array<{ id: string; name: string; projectId: string | null; createdAt: number; updatedAt: number }>>('/files'),
        apiFetch<Project[]>('/projects'),
      ])

      if (!mountedRef.current) return

      if (!filesResult.ok) {
        if (!background) {
          useConnectionStore.getState().setLoading(false)
        }
        useConnectionStore.getState().setError(filesResult.error)
        toast.error('Failed to load boards from server', {
          id: 'load-error',
          description: filesResult.error,
          action: { label: 'Retry', onClick: () => loadFromServer(false) },
        })
        return
      }

      const filesData = filesResult.data
      if (filesData && Array.isArray(filesData)) {
        // Fetch full markdown for each file
        const fullFiles: BoardFile[] = (
          await Promise.all(
            filesData.map(async (summary) => {
              const result = await apiFetch<{ markdown?: string }>(`/files/${summary.id}`)
              if (!result.ok) return null
              const file: BoardFile = {
                id: summary.id,
                name: summary.name,
                markdown: result.data?.markdown ?? '',
                createdAt: summary.createdAt,
                updatedAt: summary.updatedAt,
                projectId: summary.projectId,
                archiveBoardId: (summary as Record<string, unknown>).archiveBoardId as string | null ?? null,
                backlogBoardId: (summary as Record<string, unknown>).backlogBoardId as string | null ?? null,
              }
              // Track confirmed markdown
              confirmedMarkdownRef.current.set(file.id, file.markdown)
              return file
            })
          )
        ).filter((f): f is BoardFile => f !== null)

        if (!mountedRef.current) return

        isServerUpdateRef.current = true
        useFilesStore.setState({
          files: fullFiles,
          projects: (projectsResult.ok ? projectsResult.data : null) as Project[] ?? [],
          activeFileId: fullFiles.length > 0 ? fullFiles[0].id : null,
        })
        queueMicrotask(() => { isServerUpdateRef.current = false })
      }

      if (!background) {
        useConnectionStore.getState().setLoading(false)
      }
      hasLoadedOnceRef.current = true
    }

    loadFromServer()

    // Safety net: never show skeleton for more than 15 seconds
    const skeletonSafetyTimeout = setTimeout(() => {
      if (useConnectionStore.getState().isLoading) {
        useConnectionStore.getState().setLoading(false)
        useConnectionStore.getState().setError('Server is taking too long to respond')
        toast.error('Server unreachable', {
          id: 'load-timeout',
          description: 'Could not connect to server. You can retry or continue offline.',
          action: { label: 'Retry', onClick: () => loadFromServer(false) },
        })
      }
    }, 15_000)

    // --- 2. WebSocket: real-time updates + presence ---
    function connectWs() {
      if (!mountedRef.current || !WS_BASE) return

      const token = useAuthStore.getState().token
      const wsUrl = token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : WS_BASE
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[automd] WebSocket connected')
        reconnectAttemptRef.current = 0
        useConnectionStore.getState().setStatus('connected')

        // Send presence join
        const username = useUserStore.getState().username
        ws.send(JSON.stringify({
          type: 'presence:join',
          payload: { username: username || 'Anonymous' },
        }))

        // Re-fetch to catch events missed during disconnection
        // Use background mode if data already loaded (don't flash skeleton)
        loadFromServer(hasLoadedOnceRef.current)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          isServerUpdateRef.current = true

          switch (msg.type) {
            case 'file:updated': {
              const { id, markdown, actor } = msg.payload
              useFilesStore.getState().updateFileMarkdown(id, markdown)
              confirmedMarkdownRef.current.set(id, markdown)
              if (useFilesStore.getState().activeFileId === id) {
                useDocumentStore.getState().reparseFromMarkdown(markdown)
              }
              // Activity event
              const file = useFilesStore.getState().files.find(f => f.id === id)
              useActivityStore.getState().addEvent({
                type: 'file:updated',
                description: `Updated board "${file?.name || id}"`,
                actor: actor || 'Someone',
                timestamp: Date.now(),
                fileId: id,
                fileName: file?.name,
              })
              break
            }
            case 'file:created': {
              apiFetch<BoardFile>(`/files/${msg.payload.id}`).then((result) => {
                if (!mountedRef.current || !result.ok) return
                const file = result.data
                useFilesStore.setState((state) => ({
                  files: [...state.files, {
                    id: file.id,
                    name: file.name,
                    markdown: file.markdown,
                    createdAt: file.createdAt,
                    updatedAt: file.updatedAt,
                    projectId: file.projectId,
                    archiveBoardId: (file as Record<string, unknown>).archiveBoardId as string | null ?? null,
                    backlogBoardId: (file as Record<string, unknown>).backlogBoardId as string | null ?? null,
                  }],
                }))
                confirmedMarkdownRef.current.set(file.id, file.markdown)
                // Activity event
                useActivityStore.getState().addEvent({
                  type: 'file:created',
                  description: `Created board "${file.name}"`,
                  actor: msg.payload.actor || 'Someone',
                  timestamp: Date.now(),
                  fileId: file.id,
                  fileName: file.name,
                })
              })
              break
            }
            case 'file:deleted': {
              const { id } = msg.payload
              const file = useFilesStore.getState().files.find(f => f.id === id)
              useFilesStore.getState().deleteFile(id)
              confirmedMarkdownRef.current.delete(id)
              // Activity event
              useActivityStore.getState().addEvent({
                type: 'file:deleted',
                description: `Deleted board "${file?.name || id}"`,
                actor: msg.payload.actor || 'Someone',
                timestamp: Date.now(),
                fileId: id,
                fileName: file?.name,
              })
              break
            }
            case 'project:created':
            case 'project:updated': {
              apiFetch<Project[]>('/projects').then((result) => {
                if (!mountedRef.current || !result.ok) return
                useFilesStore.setState({ projects: result.data })
              })
              const actionWord = msg.type === 'project:created' ? 'Created' : 'Updated'
              useActivityStore.getState().addEvent({
                type: msg.type,
                description: `${actionWord} project "${msg.payload.name || msg.payload.id}"`,
                actor: msg.payload.actor || 'Someone',
                timestamp: Date.now(),
              })
              break
            }
            case 'project:deleted': {
              useFilesStore.getState().deleteProject(msg.payload.id)
              useActivityStore.getState().addEvent({
                type: 'project:deleted',
                description: `Deleted project "${msg.payload.name || msg.payload.id}"`,
                actor: msg.payload.actor || 'Someone',
                timestamp: Date.now(),
              })
              break
            }
            case 'presence:list': {
              const { agents } = msg.payload
              if (Array.isArray(agents)) {
                useConnectionStore.getState().setAgents(agents)
              }
              break
            }
          }

          queueMicrotask(() => { isServerUpdateRef.current = false })
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        console.log('[automd] WebSocket disconnected')
        // Guard: if wsRef was already reassigned (manual reconnect), skip auto-reconnect
        if (wsRef.current !== ws && wsRef.current !== null) return
        wsRef.current = null
        if (!mountedRef.current) return

        useConnectionStore.getState().setStatus('reconnecting')
        useConnectionStore.getState().setAgents([])

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
        const attempt = reconnectAttemptRef.current++
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
        console.log(`[automd] Reconnecting in ${delay}ms (attempt ${attempt + 1})`)

        reconnectTimeoutRef.current = setTimeout(connectWs, delay)
      }

      ws.onerror = (err) => {
        console.error('[automd] WebSocket error:', err)
        // onclose will fire after onerror, so reconnection happens there
      }
    }

    connectWs()

    // Expose manual reconnect for the UI
    useConnectionStore.getState().setReconnect(() => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      reconnectAttemptRef.current = 0
      connectWs()
    })

    // --- 3. Re-send presence when username changes ---
    const unsubUsername = useUserStore.subscribe(
      (state) => state.username,
      (username) => {
        const ws = wsRef.current
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'presence:join',
            payload: { username: username || 'Anonymous' },
          }))
        }
      }
    )

    // --- 4. Forward local markdown changes to server (debounced, with rollback) ---
    const unsubMarkdown = useDocumentStore.subscribe(
      (state) => state.markdown,
      (_markdown) => {
        if (isServerUpdateRef.current) return
        if (!HAS_SERVER) return

        const activeFileId = useFilesStore.getState().activeFileId
        if (!activeFileId) return

        // Debounce PUTs to avoid firing on every keystroke
        if (saveDebouncerRef.current) {
          clearTimeout(saveDebouncerRef.current)
        }

        saveDebouncerRef.current = setTimeout(async () => {
          const fileId = useFilesStore.getState().activeFileId
          if (!fileId) return

          const currentMarkdown = useDocumentStore.getState().markdown
          const actor = useUserStore.getState().username || 'Anonymous'

          const result = await apiFetch(`/files/${fileId}`, {
            method: 'PUT',
            body: JSON.stringify({ markdown: currentMarkdown, actor }),
          })

          if (result.ok) {
            confirmedMarkdownRef.current.set(fileId, currentMarkdown)
          } else {
            // Rollback to last confirmed version
            const confirmed = confirmedMarkdownRef.current.get(fileId)
            if (confirmed !== undefined) {
              isServerUpdateRef.current = true
              useFilesStore.getState().updateFileMarkdown(fileId, confirmed)
              if (useFilesStore.getState().activeFileId === fileId) {
                useDocumentStore.getState().reparseFromMarkdown(confirmed)
              }
              queueMicrotask(() => { isServerUpdateRef.current = false })
            }
            toast.error('Failed to save — changes reverted', {
              id: 'save-error',
              description: result.error,
              action: {
                label: 'Retry',
                onClick: () => {
                  const md = useDocumentStore.getState().markdown
                  const fid = useFilesStore.getState().activeFileId
                  if (fid) {
                    apiFetch(`/files/${fid}`, {
                      method: 'PUT',
                      body: JSON.stringify({ markdown: md, actor: useUserStore.getState().username || 'Anonymous' }),
                    })
                  }
                },
              },
            })
          }
        }, 500)
      }
    )

    return () => {
      mountedRef.current = false
      unsubMarkdown()
      unsubUsername()
      clearTimeout(skeletonSafetyTimeout)
      if (saveDebouncerRef.current) {
        clearTimeout(saveDebouncerRef.current)
        saveDebouncerRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      useConnectionStore.getState().setStatus('disconnected')
      useConnectionStore.getState().setAgents([])
      useConnectionStore.getState().setReconnect(null)
    }
  }, [authToken, authStatus])
}
