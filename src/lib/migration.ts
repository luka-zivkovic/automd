import { nanoid } from 'nanoid'
import type { BoardFile } from '@/lib/markdown/types'

/**
 * Migrate from the single-document store (`automd-document`) to the
 * multi-file store (`automd-files`).
 *
 * Called once on app startup. If `automd-files` already exists in
 * localStorage, this is a no-op. Otherwise it reads the old single-doc
 * persisted state and creates a BoardFile from it.
 */
export function migrateToMultiFile(): void {
  // If multi-file store already exists, nothing to do
  const existing = localStorage.getItem('automd-files')
  if (existing) return

  // Read the old single-document persist key
  let markdown: string | null = null
  try {
    const raw = localStorage.getItem('automd-document')
    if (raw) {
      const parsed = JSON.parse(raw)
      // Zustand persist format: { state: { markdown: '...' }, version: 0 }
      if (parsed?.state?.markdown) {
        markdown = parsed.state.markdown
      }
    }
  } catch {
    // If parsing fails, just start fresh
  }

  if (!markdown) return

  const now = Date.now()
  const id = nanoid()
  const file: BoardFile = {
    id,
    name: 'My Board',
    markdown,
    createdAt: now,
    updatedAt: now,
    projectId: null,
  }

  // Write in Zustand persist format
  const filesState = {
    state: {
      files: [file],
      activeFileId: id,
      projects: [],
    },
    version: 0,
  }

  localStorage.setItem('automd-files', JSON.stringify(filesState))
}
