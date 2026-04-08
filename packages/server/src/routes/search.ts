/**
 * Hybrid Search Route — combines text search + semantic search.
 *
 * GET /api/search?q=...&mode=hybrid&limit=20&label=...&knowledgeOnly=true
 *
 * When embeddings are configured, merges text + semantic results
 * via Reciprocal Rank Fusion. Falls back to text-only otherwise.
 */

import { Router } from 'express'
import * as storage from '../storage.js'
import { parseBoard } from '../board-cache.js'
import { semanticSearch, isEmbeddingsEnabled } from '../embeddings/index.js'
import { classifyTask } from '../embeddings/indexer.js'
import { getRelationships } from '../relationships.js'
import type { Task } from '@automd/shared'
import type { ContentTier } from '../embeddings/vector-store.js'

export const searchRouter = Router()

interface SearchHit {
  itemId: string
  itemName: string
  taskId: string
  title: string
  labels: string[]
  description: string | null
  learnings: string | null
  column: string
  score: number
  matchType: 'text' | 'semantic' | 'both'
  tier: ContentTier
  updatedAt?: number  // Unix timestamp ms for recency weighting
}

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q as string || '').trim()
    if (!q) {
      res.status(400).json({ error: 'q parameter is required' })
      return
    }

    const rawLimit = parseInt(req.query.limit as string ?? '', 10)
    const limit = Math.min(Number.isNaN(rawLimit) ? 20 : Math.max(1, rawLimit), 100)
    const label = (req.query.label as string || '').trim() || null
    const knowledgeOnly = req.query.knowledgeOnly === 'true'
    const compact = req.query.compact === 'true'
    const embeddingsAvailable = isEmbeddingsEnabled()
    const requestedMode = (req.query.mode as string) || (embeddingsAvailable ? 'hybrid' : 'text')
    const mode = (requestedMode === 'semantic' || requestedMode === 'hybrid') && !embeddingsAvailable
      ? 'text'
      : requestedMode

    // 1. Text search
    const textResults = mode !== 'semantic' ? textSearch(q, label, knowledgeOnly) : []

    // 2. Semantic search
    const semanticResults = (mode === 'semantic' || mode === 'hybrid') && embeddingsAvailable
      ? await semanticSearchResults(q, limit * 2, label, knowledgeOnly)
      : []

    // 3. Merge + recency boost
    let results: SearchHit[]
    let effectiveMode = mode
    if (mode === 'hybrid' && textResults.length > 0 && semanticResults.length > 0) {
      results = mergeWithRRF(textResults, semanticResults) // recency applied inside RRF
    } else if (mode === 'semantic') {
      results = applyRecencyBoost(semanticResults)
      results.sort((a, b) => b.score - a.score)
    } else {
      results = applyRecencyBoost(textResults)
      results.sort((a, b) => b.score - a.score)
      if (mode === 'hybrid') effectiveMode = 'text'  // semantic was empty, fell back
    }

    // 4. Tier boost: knowledge items get score premium
    results = applyTierBoost(results)
    results.sort((a, b) => b.score - a.score)

    // 5. Graph-aware boost: items related to other results get a score bump
    results = applyGraphBoost(results)

    // 6. Limit
    results = results.slice(0, limit)

    // 7. Compact mode: reduce token count for agent consumption
    const finalResults = compact ? compactResults(results) : results

    res.json({
      count: finalResults.length,
      mode: effectiveMode,
      embeddingsEnabled: embeddingsAvailable,
      results: finalResults,
    })
  } catch (err) {
    next(err)
  }
})

// ─── Text Search (BM25-lite) ────────────────────────────────────────────

/** Tokenize text into lowercase words, stripping punctuation. */
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
}

/** BM25 field weights — higher = more important. */
const FIELD_WEIGHTS = {
  title: 2.0,
  learnings: 1.5,
  tags: 1.2,
  description: 1.0,
  ac: 0.8,
} as const

/** BM25 parameters */
const BM25_K1 = 1.2
const BM25_B = 0.75

/** Pre-computed IDF + corpus stats for BM25 scoring. */
interface BM25Corpus {
  docCount: number
  avgFieldLengths: Record<string, number>
  /** Number of documents containing each term per field */
  termDocFreq: Record<string, Map<string, number>>
}

function buildBM25Corpus(docs: Array<{ fields: Record<string, string[]> }>): BM25Corpus {
  const fieldLengthSums: Record<string, number> = {}
  const termDocFreq: Record<string, Map<string, number>> = {}

  for (const fieldName of Object.keys(FIELD_WEIGHTS)) {
    fieldLengthSums[fieldName] = 0
    termDocFreq[fieldName] = new Map()
  }

  for (const doc of docs) {
    for (const [fieldName, tokens] of Object.entries(doc.fields)) {
      if (!(fieldName in FIELD_WEIGHTS)) continue
      fieldLengthSums[fieldName] += tokens.length
      const seen = new Set(tokens)
      for (const term of seen) {
        termDocFreq[fieldName].set(term, (termDocFreq[fieldName].get(term) ?? 0) + 1)
      }
    }
  }

  const avgFieldLengths: Record<string, number> = {}
  for (const fieldName of Object.keys(FIELD_WEIGHTS)) {
    avgFieldLengths[fieldName] = docs.length > 0 ? fieldLengthSums[fieldName] / docs.length : 0
  }

  return { docCount: docs.length, avgFieldLengths, termDocFreq }
}

function bm25Score(
  queryTerms: string[],
  fields: Record<string, string[]>,
  corpus: BM25Corpus,
): number {
  let totalScore = 0

  for (const [fieldName, fieldWeight] of Object.entries(FIELD_WEIGHTS)) {
    const tokens = fields[fieldName] ?? []
    if (tokens.length === 0) continue

    const avgDl = corpus.avgFieldLengths[fieldName] || 1
    const dl = tokens.length

    // Build term frequency map for this field
    const tf = new Map<string, number>()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1)
    }

    for (const term of queryTerms) {
      const termFreq = tf.get(term) ?? 0
      if (termFreq === 0) continue

      const df = corpus.termDocFreq[fieldName]?.get(term) ?? 0
      // IDF with smoothing (BM25 standard)
      const idf = Math.log(1 + (corpus.docCount - df + 0.5) / (df + 0.5))

      // BM25 TF normalization
      const tfNorm = (termFreq * (BM25_K1 + 1)) / (termFreq + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgDl))

      totalScore += fieldWeight * idf * tfNorm
    }
  }

  return totalScore
}

function textSearch(query: string, labelFilter: string | null, knowledgeOnly: boolean): SearchHit[] {
  const queryTerms = tokenize(query)
  if (queryTerms.length === 0) return []

  const files = storage.listFiles()

  // First pass: collect all eligible documents and tokenize fields
  const docs: Array<{
    file: typeof files[0]
    task: Task
    allLabels: string[]
    column: string
    fields: Record<string, string[]>
    updatedAt: number
    tier: ContentTier
  }> = []

  for (const file of files) {
    const { columns, tasks, meta } = parseBoard(file.markdown, file.id)
    const frontmatterTags = meta?.tags ?? []

    for (const task of flattenTasks(tasks)) {
      // Tier-based filtering: classify content, skip if not embeddable
      const tier = classifyTask(task, file.itemType)
      if (!tier) continue
      if (knowledgeOnly && tier !== 'knowledge') continue

      const allLabels = [...task.metadata.labels, ...frontmatterTags]
      if (labelFilter && !allLabels.some((l) => l.toLowerCase() === labelFilter.toLowerCase())) {
        continue
      }

      const col = columns.find((c) => c.tasks.some((t) => t.id === task.id))
      const fields: Record<string, string[]> = {
        title: tokenize(task.displayContent),
        learnings: tokenize(task.learnings ?? ''),
        tags: tokenize(allLabels.join(' ')),
        description: tokenize(task.description ?? ''),
        ac: tokenize(task.acceptanceCriteria ?? ''),
      }

      docs.push({
        file,
        task,
        allLabels,
        column: col?.title ?? task.column,
        fields,
        updatedAt: file.updatedAt,
        tier,
      })
    }
  }

  // Build corpus stats for IDF
  const corpus = buildBM25Corpus(docs)

  // Second pass: score each document
  const hits: SearchHit[] = []
  for (const doc of docs) {
    const score = bm25Score(queryTerms, doc.fields, corpus)
    if (score === 0) continue

    hits.push({
      itemId: doc.file.id,
      itemName: doc.file.name,
      taskId: doc.task.id,
      title: doc.task.displayContent,
      labels: doc.allLabels,
      description: doc.task.description,
      learnings: doc.task.learnings,
      column: doc.column,
      score,
      matchType: 'text',
      tier: doc.tier,
      updatedAt: doc.updatedAt,
    })
  }

  hits.sort((a, b) => b.score - a.score)
  return hits
}

// ─── Semantic Search ────────────────────────────────────────────────────

async function semanticSearchResults(
  query: string,
  limit: number,
  labelFilter: string | null,
  knowledgeOnly: boolean,
): Promise<SearchHit[]> {
  const rawResults = await semanticSearch(query, limit)
  if (rawResults.length === 0) return []

  // Resolve task details from storage
  const hits: SearchHit[] = []
  const files = storage.listFiles()
  const fileMap = new Map(files.map((f) => [f.id, f]))

  for (const result of rawResults) {
    const file = fileMap.get(result.itemId)
    if (!file) continue

    const { columns, tasks, meta } = parseBoard(file.markdown, file.id)
    const task = flattenTasks(tasks).find((t) => t.id === result.taskId)
    if (!task) continue
    if (knowledgeOnly && result.tier !== 'knowledge') continue

    const allLabels = [...task.metadata.labels, ...(meta?.tags ?? [])]
    if (labelFilter && !allLabels.some((l) => l.toLowerCase() === labelFilter.toLowerCase())) {
      continue
    }

    const col = columns.find((c) => c.tasks.some((t) => t.id === task.id))

    // Convert distance to 0-1 similarity (cosine distance → similarity)
    const similarity = Math.max(0, 1 - result.distance)

    hits.push({
      itemId: file.id,
      itemName: file.name,
      taskId: task.id,
      title: task.displayContent,
      labels: allLabels,
      description: task.description,
      learnings: task.learnings,
      column: col?.title ?? task.column,
      score: similarity,
      matchType: 'semantic',
      tier: result.tier,
      updatedAt: file.updatedAt,
    })
  }

  return hits
}

// ─── Recency Boost ──────────────────────────────────────────────────────

/** Half-life for recency decay in days.
 *  Content updated 30 days ago gets ~50% of the recency boost. */
const RECENCY_HALF_LIFE_DAYS = 30
const RECENCY_MAX_BOOST = 0.15 // Max 15% score increase for very recent items

function applyRecencyBoost(hits: SearchHit[]): SearchHit[] {
  const now = Date.now()
  return hits.map((hit) => {
    if (!hit.updatedAt) return hit
    const ageDays = (now - hit.updatedAt) / (1000 * 60 * 60 * 24)
    const decay = Math.exp(-0.693 * ageDays / RECENCY_HALF_LIFE_DAYS) // ln(2) ≈ 0.693
    const boost = 1 + RECENCY_MAX_BOOST * decay
    return { ...hit, score: hit.score * boost }
  })
}

// ─── Reciprocal Rank Fusion ─────────────────────────────────────────────

function mergeWithRRF(textHits: SearchHit[], semanticHits: SearchHit[]): SearchHit[] {
  const K = 60 // Standard RRF constant
  const merged = new Map<string, SearchHit & { rrfScore: number }>()

  // Score text results
  for (let rank = 0; rank < textHits.length; rank++) {
    const hit = textHits[rank]
    const key = `${hit.itemId}:${hit.taskId}`
    const rrfScore = 1 / (K + rank + 1)

    if (merged.has(key)) {
      const existing = merged.get(key)!
      existing.rrfScore += rrfScore
      existing.matchType = 'both'
    } else {
      merged.set(key, { ...hit, rrfScore, matchType: 'text' })
    }
  }

  // Score semantic results
  for (let rank = 0; rank < semanticHits.length; rank++) {
    const hit = semanticHits[rank]
    const key = `${hit.itemId}:${hit.taskId}`
    const rrfScore = 1 / (K + rank + 1)

    if (merged.has(key)) {
      const existing = merged.get(key)!
      existing.rrfScore += rrfScore
      existing.matchType = 'both'
    } else {
      merged.set(key, { ...hit, rrfScore, matchType: 'semantic' })
    }
  }

  // Map RRF scores, apply recency boost, then sort
  let results = Array.from(merged.values()).map(({ rrfScore, ...hit }) => ({ ...hit, score: rrfScore }))
  results = applyRecencyBoost(results)
  results.sort((a, b) => b.score - a.score)
  return results
}

// ─── Tier Boost ─────────────────────────────────────────────────────

const TIER_BOOST: Record<ContentTier, number> = {
  knowledge: 1.2,  // Premium: curated knowledge items get 20% boost
  task: 1.0,       // Neutral: regular tasks
  page: 1.0,       // Neutral: page sections
}

function applyTierBoost(hits: SearchHit[]): SearchHit[] {
  return hits.map((hit) => ({
    ...hit,
    score: hit.score * (TIER_BOOST[hit.tier] ?? 1.0),
  }))
}

// ─── Graph-Aware Boost ──────────────────────────────────────────────

const GRAPH_BOOST = 0.10 // 10% boost for items related to other results

function applyGraphBoost(hits: SearchHit[]): SearchHit[] {
  if (hits.length < 2) return hits

  // Build a set of all result keys for quick lookup
  const resultKeys = new Set(hits.map(h => `${h.itemId}:${h.taskId}`))

  // For each result, check if it has relationships to other results
  const boosted = hits.map((hit) => {
    try {
      const rels = getRelationships(hit.itemId, hit.taskId)
      const relatedInResults = rels.filter(r => resultKeys.has(`${r.itemId}:${r.taskId}`))

      if (relatedInResults.length > 0) {
        // Boost proportional to number of related items in results (capped)
        const boost = 1 + GRAPH_BOOST * Math.min(relatedInResults.length, 3)
        return { ...hit, score: hit.score * boost }
      }
    } catch {
      // Relationships not available — skip boost
    }
    return hit
  })

  boosted.sort((a, b) => b.score - a.score)
  return boosted
}

// ─── Compact Results ────────────────────────────────────────────────

const COMPACT_MAX_CHARS = 200

function truncate(text: string | null, maxLen: number): string | null {
  if (!text) return null
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '…'
}

interface CompactHit {
  itemId: string
  itemName: string
  taskId: string
  title: string
  labels: string[]
  description: string | null
  learnings: string | null
  column: string
  score: number
  matchType: string
  tier: ContentTier
}

function compactResults(hits: SearchHit[]): CompactHit[] {
  return hits.map((hit) => ({
    itemId: hit.itemId,
    itemName: hit.itemName,
    taskId: hit.taskId,
    title: hit.title,
    labels: hit.labels,
    description: truncate(hit.description, COMPACT_MAX_CHARS),
    learnings: truncate(hit.learnings, COMPACT_MAX_CHARS),
    column: hit.column,
    score: Math.round(hit.score * 1000) / 1000,
    matchType: hit.matchType,
    tier: hit.tier,
  }))
}

// ─── Helpers ────────────────────────────────────────────────────────────

function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  for (const task of tasks) {
    result.push(task)
    if (task.children.length > 0) {
      result.push(...flattenTasks(task.children))
    }
  }
  return result
}
