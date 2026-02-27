import {
  parseMarkdown,
  annotateIds,
  createIdCache,
  extractTasksAndColumns,
  extractFrontmatter,
} from '@automd/shared'
import type { IdCache } from '@automd/shared'

/**
 * Per-board IdCache store.
 *
 * The shared library's `annotateIds` generates random IDs (via nanoid) for each
 * fresh IdCache. To keep task/column IDs stable across requests for the same
 * board, we reuse the cache instance so that fingerprints map to the same IDs.
 */
const caches = new Map<string, IdCache>()

export function parseBoard(markdown: string, boardId?: string) {
  let cache: IdCache
  if (boardId && caches.has(boardId)) {
    cache = caches.get(boardId)!
  } else {
    cache = createIdCache()
    if (boardId) caches.set(boardId, cache)
  }

  const ast = annotateIds(parseMarkdown(markdown), cache)
  const extracted = extractTasksAndColumns(ast)
  const meta = extractFrontmatter(ast)
  return { ast, cache, meta, ...extracted }
}

export function invalidateBoardCache(boardId: string) {
  caches.delete(boardId)
}

export function clearAllCaches() {
  caches.clear()
}
