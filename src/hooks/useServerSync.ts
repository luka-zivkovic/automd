import { useEffect, useRef } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useDocumentStore } from '@/store/document-store'
import type { BoardFile, Project } from '@/lib/markdown/types'

const SERVER_URL = import.meta.env.VITE_AUTOMD_SERVER ?? ''
const API_BASE = SERVER_URL ? `${SERVER_URL}/api` : ''
const WS_URL = SERVER_URL ? SERVER_URL.replace(/^http/, 'ws') + '/ws' : ''

async function apiFetch(path: string, options?: RequestInit) {
  if (!API_BASE) return null
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) return null
  if (res.status === 204) return null
  return res.json()
}

/**
 * Syncs the web app with automd-server when VITE_AUTOMD_SERVER is set.
 * When not set (default), the app runs in local-only mode with localStorage.
 */
export function useServerSync() {
  const wsRef = useRef<WebSocket | null>(null)
  const isServerUpdateRef = useRef(false)

  useEffect(() => {
    if (!SERVER_URL) return // Local-only mode

    let mounted = true

    // 1. Initial fetch: load files + projects from server
    async function loadFromServer() {
      const [filesData, projectsData] = await Promise.all([
        apiFetch('/files'),
        apiFetch('/projects'),
      ])

      if (!mounted) return

      if (filesData && Array.isArray(filesData)) {
        // Fetch full markdown for each file
        const fullFiles: BoardFile[] = await Promise.all(
          filesData.map(async (summary: { id: string; name: string; projectId: string | null; createdAt: number; updatedAt: number }) => {
            const full = await apiFetch(`/files/${summary.id}`)
            return {
              id: summary.id,
              name: summary.name,
              markdown: full?.markdown ?? '',
              createdAt: summary.createdAt,
              updatedAt: summary.updatedAt,
              projectId: summary.projectId,
            }
          })
        )

        if (!mounted) return

        isServerUpdateRef.current = true
        useFilesStore.setState({
          files: fullFiles,
          projects: (projectsData as Project[]) ?? [],
          activeFileId: fullFiles.length > 0 ? fullFiles[0].id : null,
        })
        // Small delay to let the store settle before re-enabling sync
        queueMicrotask(() => { isServerUpdateRef.current = false })
      }
    }

    loadFromServer()

    // 2. WebSocket: listen for real-time updates from other clients/agents
    if (WS_URL) {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          isServerUpdateRef.current = true

          switch (msg.type) {
            case 'file:updated': {
              const { id, markdown } = msg.payload
              useFilesStore.getState().updateFileMarkdown(id, markdown)
              // If this is the active file, also update the document store
              if (useFilesStore.getState().activeFileId === id) {
                useDocumentStore.getState().reparseFromMarkdown(markdown)
              }
              break
            }
            case 'file:created': {
              // Refetch to get full file data
              apiFetch(`/files/${msg.payload.id}`).then((file) => {
                if (file) {
                  useFilesStore.setState((state) => ({
                    files: [...state.files, {
                      id: file.id,
                      name: file.name,
                      markdown: file.markdown,
                      createdAt: file.createdAt,
                      updatedAt: file.updatedAt,
                      projectId: file.projectId,
                    }],
                  }))
                }
              })
              break
            }
            case 'file:deleted': {
              const { id } = msg.payload
              useFilesStore.getState().deleteFile(id)
              break
            }
            case 'project:created':
            case 'project:updated': {
              // Refetch all projects
              apiFetch('/projects').then((projects) => {
                if (projects) {
                  useFilesStore.setState({ projects })
                }
              })
              break
            }
            case 'project:deleted': {
              useFilesStore.getState().deleteProject(msg.payload.id)
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
      }
    }

    // 3. Forward local markdown changes to the server
    const unsubMarkdown = useDocumentStore.subscribe(
      (state) => state.markdown,
      (markdown) => {
        if (isServerUpdateRef.current) return
        if (!SERVER_URL) return

        const activeFileId = useFilesStore.getState().activeFileId
        if (!activeFileId) return

        // Debounced push to server (the files-store debounce already handles this,
        // but we also want to push to the server)
        apiFetch(`/files/${activeFileId}`, {
          method: 'PUT',
          body: JSON.stringify({ markdown }),
        })
      }
    )

    return () => {
      mounted = false
      unsubMarkdown()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])
}
