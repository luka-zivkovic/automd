/**
 * Relationship Store — tracks connections between tasks/knowledge items.
 *
 * Stored in a separate relationships.db SQLite database (not embeddings.db)
 * to avoid sharing WAL connections with the vector store.
 * Supports explicit (agent/user-created) and auto-detected (similarity-based) relationships.
 */

import Database from 'better-sqlite3'
import path from 'node:path'
import crypto from 'node:crypto'
import { getAutomdDir } from './config.js'

export type RelationType = 'depends-on' | 'related-to' | 'supersedes' | 'learned-from'

export interface Relationship {
  id: string
  sourceItemId: string
  sourceTaskId: string
  targetItemId: string
  targetTaskId: string
  relationType: RelationType
  createdAt: number
  createdBy: string // 'agent' | 'auto' | 'user'
}

export interface RelatedItem {
  itemId: string
  taskId: string
  relationType: RelationType
  direction: 'outgoing' | 'incoming'
  createdBy: string
}

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db

  const dbPath = path.join(getAutomdDir(), 'relationships.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      source_task_id TEXT NOT NULL,
      target_item_id TEXT NOT NULL,
      target_task_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      created_by TEXT NOT NULL
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_item_id, source_task_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_item_id, target_task_id)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(relation_type)`)

  return db
}

/** Add a relationship between two tasks. Returns the ID and whether it was newly created. */
export function addRelationship(
  sourceItemId: string,
  sourceTaskId: string,
  targetItemId: string,
  targetTaskId: string,
  relationType: RelationType,
  createdBy: string,
): { id: string; created: boolean } {
  const d = getDb()

  // Check for duplicate (same source, target, type)
  const existing = d.prepare(`
    SELECT id FROM relationships
    WHERE source_item_id = ? AND source_task_id = ?
      AND target_item_id = ? AND target_task_id = ?
      AND relation_type = ?
  `).get(sourceItemId, sourceTaskId, targetItemId, targetTaskId, relationType) as { id: string } | undefined

  if (existing) return { id: existing.id, created: false }

  // Also check reverse for bidirectional types
  if (relationType === 'related-to') {
    const reverse = d.prepare(`
      SELECT id FROM relationships
      WHERE source_item_id = ? AND source_task_id = ?
        AND target_item_id = ? AND target_task_id = ?
        AND relation_type = ?
    `).get(targetItemId, targetTaskId, sourceItemId, sourceTaskId, relationType) as { id: string } | undefined

    if (reverse) return { id: reverse.id, created: false }
  }

  const id = crypto.randomUUID()
  d.prepare(`
    INSERT INTO relationships (id, source_item_id, source_task_id, target_item_id, target_task_id, relation_type, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sourceItemId, sourceTaskId, targetItemId, targetTaskId, relationType, Date.now(), createdBy)

  return { id, created: true }
}

/** Get all relationships for a specific task (both directions). */
export function getRelationships(itemId: string, taskId: string): RelatedItem[] {
  const d = getDb()

  const outgoing = d.prepare(`
    SELECT target_item_id, target_task_id, relation_type, created_by
    FROM relationships
    WHERE source_item_id = ? AND source_task_id = ?
  `).all(itemId, taskId) as Array<{
    target_item_id: string
    target_task_id: string
    relation_type: RelationType
    created_by: string
  }>

  const incoming = d.prepare(`
    SELECT source_item_id, source_task_id, relation_type, created_by
    FROM relationships
    WHERE target_item_id = ? AND target_task_id = ?
  `).all(itemId, taskId) as Array<{
    source_item_id: string
    source_task_id: string
    relation_type: RelationType
    created_by: string
  }>

  const results: RelatedItem[] = [
    ...outgoing.map((r) => ({
      itemId: r.target_item_id,
      taskId: r.target_task_id,
      relationType: r.relation_type,
      direction: 'outgoing' as const,
      createdBy: r.created_by,
    })),
    ...incoming.map((r) => ({
      itemId: r.source_item_id,
      taskId: r.source_task_id,
      relationType: r.relation_type,
      direction: 'incoming' as const,
      createdBy: r.created_by,
    })),
  ]

  return results
}

/** Batch-fetch relationships for multiple tasks at once (single transaction, reused prepared statements). */
export function getRelationshipsBatch(
  tasks: Array<{ itemId: string; taskId: string }>
): Map<string, RelatedItem[]> {
  if (tasks.length === 0) return new Map()
  const d = getDb()
  const result = new Map<string, RelatedItem[]>()

  for (const t of tasks) {
    result.set(`${t.itemId}:${t.taskId}`, [])
  }

  const fetchAll = d.transaction(() => {
    const outStmt = d.prepare(`SELECT target_item_id, target_task_id, relation_type, created_by FROM relationships WHERE source_item_id = ? AND source_task_id = ?`)
    const inStmt = d.prepare(`SELECT source_item_id, source_task_id, relation_type, created_by FROM relationships WHERE target_item_id = ? AND target_task_id = ?`)

    for (const t of tasks) {
      const key = `${t.itemId}:${t.taskId}`
      const outgoing = outStmt.all(t.itemId, t.taskId) as Array<{
        target_item_id: string; target_task_id: string; relation_type: RelationType; created_by: string
      }>
      const incoming = inStmt.all(t.itemId, t.taskId) as Array<{
        source_item_id: string; source_task_id: string; relation_type: RelationType; created_by: string
      }>

      result.get(key)!.push(
        ...outgoing.map(r => ({ itemId: r.target_item_id, taskId: r.target_task_id, relationType: r.relation_type, direction: 'outgoing' as const, createdBy: r.created_by })),
        ...incoming.map(r => ({ itemId: r.source_item_id, taskId: r.source_task_id, relationType: r.relation_type, direction: 'incoming' as const, createdBy: r.created_by }))
      )
    }
  })

  fetchAll()
  return result
}

/** Remove a specific relationship by ID. */
export function removeRelationship(id: string): boolean {
  const d = getDb()
  const result = d.prepare('DELETE FROM relationships WHERE id = ?').run(id)
  return result.changes > 0
}

/** Remove all auto-detected relationships (for re-detection). */
export function clearAutoRelationships(): number {
  const d = getDb()
  const result = d.prepare("DELETE FROM relationships WHERE created_by = 'auto'").run()
  return result.changes
}

/** Remove all relationships involving a specific item (for cleanup on delete). */
export function removeRelationshipsForItem(itemId: string): number {
  const d = getDb()
  const result = d.prepare(
    'DELETE FROM relationships WHERE source_item_id = ? OR target_item_id = ?',
  ).run(itemId, itemId)
  return result.changes
}

/** Get relationship count. */
export function countRelationships(): { total: number; auto: number; manual: number } {
  const d = getDb()
  const total = (d.prepare('SELECT COUNT(*) as c FROM relationships').get() as { c: number }).c
  const auto = (d.prepare("SELECT COUNT(*) as c FROM relationships WHERE created_by = 'auto'").get() as { c: number }).c
  return { total, auto, manual: total - auto }
}

/** Close the database connection (for cleanup). */
export function closeRelationshipsDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
