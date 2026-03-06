import { useEffect, useRef } from 'react'
import { useUiStore, type ViewMode } from '@/store/ui-store'
import { useFilesStore } from '@/store/files-store'

// ── URL ↔ View mapping ───────────────────────────────────────────────

const STANDALONE_VIEWS: Record<string, ViewMode> = {
  '/': 'dashboard',
  '/memory': 'memory',
  '/connect': 'connect',
  '/prompts': 'prompts',
}

const VIEW_TO_PATH: Partial<Record<ViewMode, string>> = {
  dashboard: '/',
  memory: '/memory',
  connect: '/connect',
  prompts: '/prompts',
}

const FILE_VIEW_SUFFIX: Record<string, ViewMode> = {
  '': 'checklist',
  '/editor': 'editor',
  '/kanban': 'kanban',
  '/document': 'document',
  '/knowledge': 'knowledge',
}

const VIEW_TO_SUFFIX: Partial<Record<ViewMode, string>> = {
  checklist: '',
  editor: '/editor',
  kanban: '/kanban',
  document: '/document',
  knowledge: '/knowledge',
}

interface ParsedUrl {
  view: ViewMode
  fileId: string | null
}

function parseUrl(pathname: string): ParsedUrl {
  const standalone = STANDALONE_VIEWS[pathname]
  if (standalone) return { view: standalone, fileId: null }

  const match = pathname.match(/^\/board\/([^/]+)(\/.*)?$/)
  if (match) {
    const fileId = decodeURIComponent(match[1])
    const suffix = match[2] ?? ''
    const view = FILE_VIEW_SUFFIX[suffix]
    if (view) return { view, fileId }
  }

  return { view: 'dashboard', fileId: null }
}

function buildUrl(view: ViewMode, fileId: string | null): string {
  const standalonePath = VIEW_TO_PATH[view]
  if (standalonePath !== undefined) return standalonePath

  if (!fileId) return '/'

  const suffix = VIEW_TO_SUFFIX[view] ?? ''
  return `/board/${encodeURIComponent(fileId)}${suffix}`
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useUrlSync() {
  const isPopstateRef = useRef(false)

  // On mount: read URL → apply to stores (handles refresh, direct URL, bookmarks)
  useEffect(() => {
    const { view, fileId } = parseUrl(window.location.pathname)
    const store = useUiStore.getState()
    const filesStore = useFilesStore.getState()

    if (fileId) {
      const exists = filesStore.files.some((f) => f.id === fileId)
      if (exists) {
        filesStore.setActiveFile(fileId)
        store.setActiveView(view)
      } else {
        // Stale bookmark — redirect to dashboard
        store.setActiveView('dashboard')
        window.history.replaceState(null, '', '/')
      }
    } else if (view !== store.activeView) {
      store.setActiveView(view)
    }

    // Replace current entry so the initial URL is clean
    const expectedUrl = buildUrl(
      useUiStore.getState().activeView,
      useFilesStore.getState().activeFileId,
    )
    if (window.location.pathname !== expectedUrl) {
      window.history.replaceState(null, '', expectedUrl)
    }
  }, [])

  // Listen for popstate (back/forward)
  useEffect(() => {
    function handlePopstate() {
      isPopstateRef.current = true
      const { view, fileId } = parseUrl(window.location.pathname)

      if (fileId) {
        const exists = useFilesStore.getState().files.some((f) => f.id === fileId)
        if (exists) {
          useFilesStore.getState().setActiveFile(fileId)
        }
      }
      useUiStore.getState().setActiveView(view)

      queueMicrotask(() => {
        isPopstateRef.current = false
      })
    }

    window.addEventListener('popstate', handlePopstate)
    return () => window.removeEventListener('popstate', handlePopstate)
  }, [])

  // Subscribe to store changes → push to URL
  useEffect(() => {
    let prevUrl = window.location.pathname
    let pendingSync = false

    function syncUrlFromStore() {
      if (pendingSync) return
      pendingSync = true
      queueMicrotask(() => {
        pendingSync = false
        if (isPopstateRef.current) return

        const view = useUiStore.getState().activeView
        const fileId = useFilesStore.getState().activeFileId
        const newUrl = buildUrl(view, fileId)

        if (newUrl !== prevUrl) {
          window.history.pushState(null, '', newUrl)
          prevUrl = newUrl
        }
      })
    }

    const unsubView = useUiStore.subscribe(
      (state) => state.activeView,
      syncUrlFromStore,
    )

    const unsubFile = useFilesStore.subscribe(
      (state) => state.activeFileId,
      syncUrlFromStore,
    )

    return () => {
      unsubView()
      unsubFile()
    }
  }, [])
}
