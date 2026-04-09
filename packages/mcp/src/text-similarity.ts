/**
 * Text similarity utilities for knowledge deduplication.
 * Uses Jaccard similarity on word tokens to detect near-duplicate entries.
 */

import { STOP_WORDS } from './stop-words.js'

/** Lowercase, strip punctuation, collapse whitespace */
export function normalizeText(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokenize and remove stop words, return as Set for set operations */
export function tokenize(text: string): Set<string> {
  if (!text) return new Set()
  const normalized = normalizeText(text)
  const tokens = normalized.split(' ').filter(t => t.length >= 2 && !STOP_WORDS.has(t))
  return new Set(tokens)
}

/** Jaccard similarity: |intersection| / |union|. Returns 0.0–1.0 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0.0
  if (a.size === 0 || b.size === 0) return 0.0

  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection++
  }

  const union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}

export interface DuplicateMatch {
  taskId: string
  itemId: string
  title: string
  titleSimilarity: number
  contentSimilarity: number
  isDuplicate: boolean
}

export interface ExistingKnowledgeItem {
  taskId: string
  itemId: string
  title: string
  description?: string | null
}

/**
 * Find duplicate knowledge items for a candidate entry.
 *
 * Thresholds:
 * - titleSimilarity > 0.7 → duplicate
 * - contentSimilarity > 0.6 AND titleSimilarity > 0.4 → duplicate
 */
export function findDuplicates(
  candidate: { title: string; description?: string },
  existingItems: ExistingKnowledgeItem[],
): DuplicateMatch[] {
  const candidateTitleTokens = tokenize(candidate.title)
  const candidateDescTokens = candidate.description ? tokenize(candidate.description) : null

  const matches: DuplicateMatch[] = []

  for (const item of existingItems) {
    const titleTokens = tokenize(item.title)
    const titleSimilarity = jaccardSimilarity(candidateTitleTokens, titleTokens)

    let contentSimilarity = 0
    if (candidateDescTokens && item.description) {
      const descTokens = tokenize(item.description)
      contentSimilarity = jaccardSimilarity(candidateDescTokens, descTokens)
    }

    const isDuplicate =
      titleSimilarity > 0.7 ||
      (contentSimilarity > 0.6 && titleSimilarity > 0.4)

    if (isDuplicate) {
      matches.push({
        taskId: item.taskId,
        itemId: item.itemId,
        title: item.title,
        titleSimilarity: Math.round(titleSimilarity * 100) / 100,
        contentSimilarity: Math.round(contentSimilarity * 100) / 100,
        isDuplicate,
      })
    }
  }

  // Sort by title similarity descending
  matches.sort((a, b) => b.titleSimilarity - a.titleSimilarity)

  return matches
}
