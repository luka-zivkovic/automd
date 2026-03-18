/**
 * Lightweight text search utilities for scored matching.
 * Standalone copy for the MCP package (no @automd/shared dependency).
 * Canonical source: packages/shared/src/text-search.ts — keep in sync.
 */

import { STOP_WORDS } from './stop-words.js'

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
