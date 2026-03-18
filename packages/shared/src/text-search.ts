/**
 * Lightweight text search utilities for scored matching.
 * No external dependencies — uses word tokenization with weighted scoring.
 */

export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'for', 'and', 'but', 'or',
  'not', 'no', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'of',
  'it', 'its', 'this', 'that', 'these', 'those', 'we', 'our', 'use',
  'using', 'used', 'if', 'then', 'so', 'as', 'up', 'out', 'about',
  'into', 'over', 'after', 'before', 'between', 'under', 'above',
])

/**
 * Normalize and tokenize text for search.
 * Strips punctuation, lowercases, removes stop words and short tokens.
 */
export function tokenizeForSearch(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')  // keep letters, numbers, hyphens
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t))
}

/**
 * Compute a relevance score between query tokens and document tokens.
 *
 * Scoring:
 * - Exact token match: +3.0
 * - Prefix match (query is prefix of doc token or vice versa, min 3 chars): +1.5
 * - Contains match (query token found within doc token): +0.5
 *
 * Normalized by query length so longer queries don't inherently score higher.
 */
export function computeScore(queryTokens: string[], docTokens: string[]): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0

  let rawScore = 0

  for (const qt of queryTokens) {
    let bestMatch = 0

    for (const dt of docTokens) {
      if (qt === dt) {
        bestMatch = 3.0
        break // exact match is best possible, stop looking
      }
      if (bestMatch < 1.5) {
        // Prefix match: "auth" matches "authentication", min 3 chars overlap
        if (qt.length >= 3 && dt.startsWith(qt)) {
          bestMatch = 1.5
        } else if (dt.length >= 3 && qt.startsWith(dt)) {
          bestMatch = 1.5
        }
      }
      if (bestMatch < 0.5) {
        // Contains match: "sql" found within "postgresql"
        if (qt.length >= 3 && dt.includes(qt)) {
          bestMatch = 0.5
        }
      }
    }

    rawScore += bestMatch
  }

  return rawScore / queryTokens.length
}

/**
 * Generic scored search over a collection.
 *
 * Falls back to substring matching when tokenization removes all query terms
 * (e.g. query is all stop words like "to do").
 */
export function searchAndRank<T>(
  query: string,
  items: T[],
  textExtractor: (item: T) => string,
  options?: { limit?: number; minScore?: number },
): Array<T & { _score: number }> {
  const limit = options?.limit ?? 50
  const minScore = options?.minScore ?? 0.5

  const queryTokens = tokenizeForSearch(query)

  // Fallback: if all tokens were stop words, use substring matching
  if (queryTokens.length === 0) {
    const q = query.toLowerCase().trim()
    if (!q) return []

    return items
      .filter(item => textExtractor(item).toLowerCase().includes(q))
      .slice(0, limit)
      .map(item => ({ ...item, _score: 1.0 }))
  }

  const scored: Array<T & { _score: number }> = []

  for (const item of items) {
    const docTokens = tokenizeForSearch(textExtractor(item))
    const score = computeScore(queryTokens, docTokens)
    if (score >= minScore) {
      scored.push({ ...item, _score: Math.round(score * 100) / 100 })
    }
  }

  scored.sort((a, b) => b._score - a._score)
  return scored.slice(0, limit)
}
