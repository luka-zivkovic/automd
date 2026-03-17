/**
 * Lightweight text search utilities for scored matching.
 * Standalone copy for the MCP package (no @automd/shared dependency).
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'for', 'and', 'but', 'or',
  'not', 'no', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'of',
  'it', 'its', 'this', 'that', 'these', 'those', 'we', 'our', 'use',
  'using', 'used', 'if', 'then', 'so', 'as', 'up', 'out', 'about',
  'into', 'over', 'after', 'before', 'between', 'under', 'above',
])

export function tokenizeForSearch(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOP_WORDS.has(t))
}

export function computeScore(queryTokens: string[], docTokens: string[]): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0

  let rawScore = 0

  for (const qt of queryTokens) {
    let bestMatch = 0

    for (const dt of docTokens) {
      if (qt === dt) {
        bestMatch = 3.0
        break
      }
      if (bestMatch < 1.5) {
        if (qt.length >= 3 && dt.startsWith(qt)) bestMatch = 1.5
        else if (dt.length >= 3 && qt.startsWith(dt)) bestMatch = 1.5
      }
      if (bestMatch < 0.5) {
        if (qt.length >= 3 && dt.includes(qt)) bestMatch = 0.5
      }
    }

    rawScore += bestMatch
  }

  return rawScore / queryTokens.length
}
