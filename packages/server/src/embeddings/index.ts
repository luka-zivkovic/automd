/**
 * Embeddings Facade — public API for the embeddings system.
 *
 * Lifecycle: initEmbeddings() on startup, reinitEmbeddings() on config change.
 * All operations are no-ops when embeddings are not configured.
 */

import type { AppSettings, EmbeddingsSettings } from '../settings-storage.js'
import { createProvider, type EmbeddingProvider } from './provider.js'
import { VectorStore, type SearchResult } from './vector-store.js'
import { indexBoard } from './indexer.js'
import * as storage from '../storage.js'
import { addRelationship, clearAutoRelationships, removeRelationshipsForItem } from '../relationships.js'

// ─── State ──────────────────────────────────────────────────────────────

let provider: EmbeddingProvider | null = null
let store: VectorStore | null = null

// Debounce timers for per-item indexing
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 500

// ─── Lifecycle ──────────────────────────────────────────────────────────

/** Initialize embeddings from settings. No-op if not configured. */
export function initEmbeddings(settings: AppSettings): void {
  const p = createProvider(settings.embeddings)
  if (!p) {
    provider = null
    store = null
    console.log('[embeddings] Disabled (no provider configured)')
    return
  }

  provider = p
  store = new VectorStore(p.dimensions, p.name)
  console.log(`[embeddings] Enabled — provider: ${p.name}, dimensions: ${p.dimensions}`)
}

/** Re-initialize after settings change. Closes old store if needed. */
export async function reinitEmbeddings(settings: AppSettings): Promise<void> {
  // Close existing store
  if (store) {
    store.close()
    store = null
  }
  provider = null

  initEmbeddings(settings)

  // If newly enabled, trigger background reindex
  if (provider && store) {
    backgroundReindex().catch((err) => {
      console.error('[embeddings] Background reindex failed:', err)
    })
  }
}

/** Test a provider connection without persisting anything. */
export async function testProviderConnection(
  config: EmbeddingsSettings,
): Promise<{ ok: true; dimensions: number } | { ok: false; error: string }> {
  const p = createProvider(config)
  if (!p) {
    return { ok: false, error: 'Could not create provider. Check configuration.' }
  }

  try {
    const result = await p.embed(['test'])
    if (result.length !== 1) {
      return { ok: false, error: 'Provider returned unexpected result count' }
    }
    return { ok: true, dimensions: result[0].length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Indexing ───────────────────────────────────────────────────────────

/** Queue an embedding update for a board (debounced). */
export function queueEmbeddingUpdate(fileId: string, markdown: string, itemType?: import('@automd/shared').ItemType): void {
  if (!provider || !store) return

  // Clear existing timer for this file
  const existing = debounceTimers.get(fileId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    debounceTimers.delete(fileId)
    indexBoardSafe(fileId, markdown, itemType)
  }, DEBOUNCE_MS)

  debounceTimers.set(fileId, timer)
}

/** Remove all embeddings and relationships for a board. */
export function removeEmbeddings(itemId: string): void {
  if (!store) return
  const removed = store.deleteByItemId(itemId)
  if (removed > 0) {
    console.log(`[embeddings] Removed ${removed} embeddings for item ${itemId}`)
  }
  try {
    const relRemoved = removeRelationshipsForItem(itemId)
    if (relRemoved > 0) {
      console.log(`[embeddings] Removed ${relRemoved} relationships for item ${itemId}`)
    }
  } catch {
    // Relationships table may not exist yet on first run
  }
}

// ─── Search ─────────────────────────────────────────────────────────────

/** Semantic search. Returns empty array if not configured. */
export async function semanticSearch(query: string, limit: number): Promise<SearchResult[]> {
  if (!provider || !store) return []

  try {
    const [queryVec] = await provider.embed([query])
    return store.search(queryVec, limit)
  } catch (err) {
    console.error('[embeddings] Semantic search failed:', err)
    return []
  }
}

// ─── Status ─────────────────────────────────────────────────────────────

export function isEmbeddingsEnabled(): boolean {
  return !!provider && !!store
}

export function getEmbeddingsStatus() {
  if (!provider || !store) {
    return { enabled: false }
  }
  return {
    enabled: true,
    provider: provider.name,
    dimensions: provider.dimensions,
    indexedCount: store.count(),
  }
}

/** Close stores and clean up. Call on server shutdown. */
export function shutdownEmbeddings(): void {
  // Clear pending debounce timers
  for (const timer of debounceTimers.values()) clearTimeout(timer)
  debounceTimers.clear()

  if (store) {
    store.close()
    store = null
  }
  provider = null
}

// ─── Internal ───────────────────────────────────────────────────────────

async function indexBoardSafe(fileId: string, markdown: string, itemType?: import('@automd/shared').ItemType): Promise<void> {
  if (!provider || !store) return
  try {
    const result = await indexBoard(markdown, fileId, store, provider, itemType)
    if (result.embedded > 0 || result.removed > 0) {
      console.log(`[embeddings] Indexed board ${fileId}: ${result.embedded} embedded, ${result.removed} removed`)
    }
  } catch (err) {
    console.error(`[embeddings] Failed to index board ${fileId}:`, err)
  }
}

/** Background reindex: scan all boards, index changed content, detect relationships. */
async function backgroundReindex(): Promise<void> {
  if (!provider || !store) return

  console.log('[embeddings] Starting background reindex...')
  const files = storage.listFiles()

  let totalEmbedded = 0
  let totalRemoved = 0

  for (const file of files) {
    try {
      const result = await indexBoard(file.markdown, file.id, store!, provider!, file.itemType)
      totalEmbedded += result.embedded
      totalRemoved += result.removed
    } catch (err) {
      console.error(`[embeddings] Failed to reindex board ${file.id}:`, err)
    }
  }

  console.log(`[embeddings] Reindex complete — ${totalEmbedded} embedded, ${totalRemoved} removed`)

  // Auto-detect relationships from embedding similarity
  if (store.count() > 1) {
    detectSimilarityRelationships()
  }
}

/** Cosine distance threshold for auto-relating items.
 *  Lower = more similar. 0.15 cosine distance ≈ 0.85 cosine similarity. */
const SIMILARITY_THRESHOLD = 0.15
const MAX_RELATIONS_PER_ITEM = 5

/** Detect high-similarity pairs and create auto relationships. */
function detectSimilarityRelationships(): void {
  if (!store) return

  try {
    // Clear previous auto-detected relationships
    const cleared = clearAutoRelationships()
    if (cleared > 0) {
      console.log(`[embeddings] Cleared ${cleared} stale auto-relationships`)
    }

    const allIds = store.listAllIds()
    let created = 0

    // Track processed pairs to avoid double-processing (A→B and B→A)
    const processedPairs = new Set<string>()

    for (const entry of allIds) {
      const similar = store.findSimilarTo(entry.id, SIMILARITY_THRESHOLD, MAX_RELATIONS_PER_ITEM)

      for (const match of similar) {
        // Don't relate items within the same board-task
        if (match.itemId === entry.itemId && match.taskId === entry.taskId) continue

        // Canonicalize pair key to avoid processing both A→B and B→A
        const a = `${entry.itemId}:${entry.taskId}`
        const b = `${match.itemId}:${match.taskId}`
        const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
        if (processedPairs.has(pairKey)) continue
        processedPairs.add(pairKey)

        addRelationship(
          entry.itemId,
          entry.taskId,
          match.itemId,
          match.taskId,
          'related-to',
          'auto',
        )
        created++
      }
    }

    if (created > 0) {
      console.log(`[embeddings] Auto-detected ${created} relationships`)
    }
  } catch (err) {
    console.error('[embeddings] Failed to detect similarity relationships:', err)
  }
}

/** Expose for use after individual board indexing too. */
export { detectSimilarityRelationships }
