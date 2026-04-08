/**
 * Vector Store — SQLite + sqlite-vec for local vector storage.
 *
 * Stores embedding vectors alongside metadata for change detection.
 * Database lives at ~/.automd/embeddings.db.
 */

import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import path from 'node:path'
import { getAutomdDir } from '../config.js'

export type ContentTier = 'knowledge' | 'task' | 'page'

export interface SearchResult {
  id: string
  itemId: string
  taskId: string
  distance: number
  tier: ContentTier
}

export class VectorStore {
  private db: Database.Database
  private dimensions: number
  private providerName: string

  constructor(dimensions: number, providerName: string) {
    this.dimensions = dimensions
    this.providerName = providerName

    const dbPath = path.join(getAutomdDir(), 'embeddings.db')
    this.db = new Database(dbPath)

    // Load sqlite-vec extension
    sqliteVec.load(this.db)

    this.init()
  }

  private init(): void {
    this.db.pragma('journal_mode = WAL')

    // Metadata table for tracking what's been embedded
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        provider TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_meta_item ON embedding_meta(item_id)
    `)

    // Migrate: add tier column if missing
    this.migrateTierColumn()

    // Check if vec table exists and has correct dimensions
    this.ensureVecTable()
  }

  private migrateTierColumn(): void {
    try {
      const info = this.db.prepare('PRAGMA table_info(embedding_meta)').all() as Array<{ name: string }>
      const cols = new Set(info.map((col) => col.name))

      if (!cols.has('tier')) {
        this.db.exec("ALTER TABLE embedding_meta ADD COLUMN tier TEXT NOT NULL DEFAULT 'knowledge'")
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_meta_tier ON embedding_meta(tier)')
        console.log('[embeddings] Migrated: added tier column to embedding_meta')
      }

      if (!cols.has('dimensions')) {
        this.db.exec('ALTER TABLE embedding_meta ADD COLUMN dimensions INTEGER')
        console.log('[embeddings] Migrated: added dimensions column to embedding_meta')
      }
    } catch {
      // Table may not exist yet — will be created in init()
    }
  }

  private ensureVecTable(): void {
    // Check if vec table exists
    const existing = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'")
      .get() as { name: string } | undefined

    if (existing) {
      // Verify dimensions match by checking a sample row
      // If dimensions mismatch (provider change), we need to recreate
      const needsRecreate = this.checkDimensionsMismatch()
      if (needsRecreate) {
        console.log('[embeddings] Dimensions changed, recreating vector table')
        this.db.exec('DROP TABLE embeddings')
        this.db.exec('DELETE FROM embedding_meta')
      } else {
        return
      }
    }

    this.db.exec(`
      CREATE VIRTUAL TABLE embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding float[${this.dimensions}]
      )
    `)
  }

  private checkDimensionsMismatch(): boolean {
    try {
      // Check provider name AND stored dimensions against current config.
      // Provider name alone is insufficient — switching models within the
      // same provider (e.g. text-embedding-3-small → 3-large) changes dimensions.
      const row = this.db
        .prepare('SELECT provider, dimensions FROM embedding_meta LIMIT 1')
        .get() as { provider: string; dimensions?: number } | undefined

      if (!row) return false
      if (row.provider !== this.providerName) return true
      // Treat NULL dimensions (pre-migration rows) as a mismatch — safer to recreate
      if (row.dimensions == null || row.dimensions !== this.dimensions) return true
      return false
    } catch {
      return false
    }
  }

  upsert(id: string, itemId: string, taskId: string, embedding: Float32Array, contentHash: string, tier: ContentTier = 'knowledge'): void {
    const embBuf = Buffer.from(embedding.buffer)
    const now = Date.now()

    this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT id FROM embedding_meta WHERE id = ?')
        .get(id) as { id: string } | undefined

      if (existing) {
        // Update: delete old vec entry first (vec0 doesn't support UPDATE)
        this.db.prepare('DELETE FROM embeddings WHERE id = ?').run(id)
        this.db.prepare('INSERT INTO embeddings(id, embedding) VALUES (?, ?)').run(id, embBuf)
        this.db.prepare(`
          UPDATE embedding_meta SET content_hash = ?, provider = ?, updated_at = ?, tier = ?, dimensions = ? WHERE id = ?
        `).run(contentHash, this.providerName, now, tier, this.dimensions, id)
      } else {
        // Insert new
        this.db.prepare('INSERT INTO embeddings(id, embedding) VALUES (?, ?)').run(id, embBuf)
        this.db.prepare(`
          INSERT INTO embedding_meta (id, item_id, task_id, content_hash, provider, updated_at, tier, dimensions)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, itemId, taskId, contentHash, this.providerName, now, tier, this.dimensions)
      }
    })()
  }

  search(queryEmbedding: Float32Array, limit: number): SearchResult[] {
    const rows = this.db.prepare(`
      SELECT e.id, m.item_id, m.task_id, m.tier, e.distance
      FROM embeddings e
      JOIN embedding_meta m ON m.id = e.id
      WHERE e.embedding MATCH ?
      ORDER BY e.distance
      LIMIT ?
    `).all(Buffer.from(queryEmbedding.buffer), limit) as Array<{
      id: string
      item_id: string
      task_id: string
      tier: ContentTier
      distance: number
    }>

    return rows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      taskId: r.task_id,
      distance: r.distance,
      tier: r.tier ?? 'knowledge',
    }))
  }

  getContentHash(id: string): string | null {
    const row = this.db
      .prepare('SELECT content_hash FROM embedding_meta WHERE id = ?')
      .get(id) as { content_hash: string } | undefined
    return row?.content_hash ?? null
  }

  deleteByItemId(itemId: string): number {
    const ids = this.db
      .prepare('SELECT id FROM embedding_meta WHERE item_id = ?')
      .all(itemId) as Array<{ id: string }>

    for (const { id } of ids) {
      this.db.prepare('DELETE FROM embeddings WHERE id = ?').run(id)
    }
    const result = this.db.prepare('DELETE FROM embedding_meta WHERE item_id = ?').run(itemId)
    return result.changes
  }

  deleteById(id: string): void {
    this.db.prepare('DELETE FROM embeddings WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM embedding_meta WHERE id = ?').run(id)
  }

  listIdsByItemId(itemId: string): string[] {
    const rows = this.db
      .prepare('SELECT id FROM embedding_meta WHERE item_id = ?')
      .all(itemId) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  /** Find items similar to a given embedding ID, excluding same-item results.
   *  Used for auto-relationship detection. */
  findSimilarTo(id: string, maxDistance: number, limit: number): SearchResult[] {
    // Get the embedding for this ID
    const meta = this.db
      .prepare('SELECT item_id, task_id FROM embedding_meta WHERE id = ?')
      .get(id) as { item_id: string; task_id: string } | undefined
    if (!meta) return []

    // Get the embedding vector
    const vec = this.db
      .prepare('SELECT embedding FROM embeddings WHERE id = ?')
      .get(id) as { embedding: Buffer } | undefined
    if (!vec) return []

    // Ensure proper float32 byte alignment for sqlite-vec MATCH
    const queryBuf = Buffer.from(vec.embedding.buffer, vec.embedding.byteOffset, vec.embedding.byteLength)

    // Search for similar, filtering out self
    const rows = this.db.prepare(`
      SELECT e.id, m.item_id, m.task_id, m.tier, e.distance
      FROM embeddings e
      JOIN embedding_meta m ON m.id = e.id
      WHERE e.embedding MATCH ?
        AND e.id != ?
      ORDER BY e.distance
      LIMIT ?
    `).all(queryBuf, id, limit + 1) as Array<{
      id: string
      item_id: string
      task_id: string
      tier: ContentTier
      distance: number
    }>

    return rows
      .filter((r) => r.distance <= maxDistance)
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        itemId: r.item_id,
        taskId: r.task_id,
        distance: r.distance,
        tier: r.tier ?? 'knowledge' as ContentTier,
      }))
  }

  /** Get all embedding IDs in the store. */
  listAllIds(): Array<{ id: string; itemId: string; taskId: string }> {
    const rows = this.db
      .prepare('SELECT id, item_id, task_id FROM embedding_meta')
      .all() as Array<{ id: string; item_id: string; task_id: string }>
    return rows.map((r) => ({ id: r.id, itemId: r.item_id, taskId: r.task_id }))
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM embedding_meta')
      .get() as { count: number }
    return row.count
  }

  close(): void {
    this.db.close()
  }
}
