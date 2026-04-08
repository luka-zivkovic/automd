import { useEffect, useRef } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useDocumentStore } from '@/store/document-store'

/**
 * Bidirectional sync between files-store and document-store.
 *
 * - When `activeFileId` changes, load that file's markdown into document-store.
 * - When document-store's `markdown` changes, update the active file in files-store.
 *
 * A debounce (300ms) is used for markdown-to-file sync to avoid thrashing.
 * A guard ref prevents infinite loops (file load triggers markdown change,
 * which would otherwise trigger file update).
 */
export function useActiveFileSync() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isLoadingFileRef = useRef(false)

  // Subscribe to activeFileId changes: load file markdown into document-store
  useEffect(() => {
    const loadActiveFile = (activeFileId: string | null) => {
      if (!activeFileId) {
        // Auto-select first file if none active
        const files = useFilesStore.getState().files
        if (files.length > 0) {
          useFilesStore.getState().setActiveFile(files[0].id)
        }
        return
      }

      const file = useFilesStore.getState().files.find((f) => f.id === activeFileId)
      if (!file) return

      // Guard: mark that we are loading a file so the markdown subscriber
      // does not echo this change back to files-store
      isLoadingFileRef.current = true

      // reparseFromMarkdown also sets markdown, so no separate setMarkdown needed
      useDocumentStore.getState().reparseFromMarkdown(file.markdown)

      // Clear the guard after a microtask so the synchronous path completes
      queueMicrotask(() => {
        isLoadingFileRef.current = false
      })
    }

    // Load on mount with current active file
    loadActiveFile(useFilesStore.getState().activeFileId)

    // Subscribe to future activeFileId changes
    const unsub = useFilesStore.subscribe(
      (state) => state.activeFileId,
      (activeFileId) => {
        loadActiveFile(activeFileId)
      }
    )

    return unsub
  }, [])

  // Subscribe to document-store markdown changes: update active file
  useEffect(() => {
    const unsub = useDocumentStore.subscribe(
      (state) => state.markdown,
      (markdown) => {
        // Don't echo back if we're loading a file
        if (isLoadingFileRef.current) return

        // Capture the active file ID NOW (at change time), not at timer fire time
        const targetFileId = useFilesStore.getState().activeFileId
        if (!targetFileId) return

        // Debounce the write to files-store
        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
        }

        debounceRef.current = setTimeout(() => {
          // Verify the target file is still active before writing
          const currentFileId = useFilesStore.getState().activeFileId
          if (currentFileId === targetFileId) {
            useFilesStore.getState().updateFileMarkdown(targetFileId, markdown)
          }
        }, 300)
      }
    )

    return () => {
      unsub()
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])
}
