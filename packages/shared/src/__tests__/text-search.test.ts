import { describe, it, expect } from 'vitest'
import { tokenizeForSearch, computeScore, searchAndRank, STOP_WORDS } from '../text-search'

describe('tokenizeForSearch', () => {
  it('should lowercase and split on whitespace', () => {
    expect(tokenizeForSearch('Hello World')).toEqual(['hello', 'world'])
  })

  it('should strip punctuation', () => {
    expect(tokenizeForSearch('fix: the bug!')).toEqual(['fix', 'bug'])
  })

  it('should remove stop words', () => {
    const tokens = tokenizeForSearch('use the database for queries')
    expect(tokens).toEqual(['database', 'queries'])
  })

  it('should remove tokens shorter than 2 characters', () => {
    expect(tokenizeForSearch('a b cd ef')).toEqual(['cd', 'ef'])
  })

  it('should handle empty input', () => {
    expect(tokenizeForSearch('')).toEqual([])
    expect(tokenizeForSearch(null as unknown as string)).toEqual([])
  })

  it('should preserve hyphens in tokens', () => {
    const tokens = tokenizeForSearch('pre-commit hook')
    expect(tokens).toEqual(['pre-commit', 'hook'])
  })

  it('should handle unicode letters', () => {
    const tokens = tokenizeForSearch('über cool café')
    expect(tokens).toEqual(['über', 'cool', 'café'])
  })
})

describe('computeScore', () => {
  it('should return 0 for empty inputs', () => {
    expect(computeScore([], ['hello'])).toBe(0)
    expect(computeScore(['hello'], [])).toBe(0)
  })

  it('should score exact match at 3.0', () => {
    expect(computeScore(['auth'], ['auth'])).toBe(3.0)
  })

  it('should score prefix match at 1.5', () => {
    // "auth" is prefix of "authentication"
    expect(computeScore(['auth'], ['authentication'])).toBe(1.5)
  })

  it('should score reverse prefix match at 1.5', () => {
    // "rea" (3 chars >= 3) is prefix of "react" → 1.5
    expect(computeScore(['rea'], ['react'])).toBe(1.5)
    // Reverse: doc token "api" is prefix of query token "api-key" → 1.5
    expect(computeScore(['api-key'], ['api'])).toBe(1.5)
  })

  it('should score contains match at 0.5', () => {
    // "sql" found within "postgresql"
    expect(computeScore(['sql'], ['postgresql'])).toBe(0.5)
  })

  it('should return 0 for completely unrelated terms', () => {
    expect(computeScore(['zebra'], ['authentication', 'database'])).toBe(0)
  })

  it('should normalize by query length', () => {
    // 2 query tokens, only one matches exactly
    const score = computeScore(['auth', 'zebra'], ['auth', 'middleware'])
    expect(score).toBe(1.5) // (3.0 + 0) / 2
  })

  it('should use best match per query token', () => {
    // "auth" appears as exact match — should get 3.0, not 1.5 from prefix
    const score = computeScore(['auth'], ['authentication', 'auth', 'login'])
    expect(score).toBe(3.0)
  })

  it('should handle multi-word queries', () => {
    // "database migration" — both match exactly
    const score = computeScore(
      ['database', 'migration'],
      ['migrate', 'database', 'postgresql', 'migration'],
    )
    expect(score).toBe(3.0) // both exact: (3 + 3) / 2
  })

  it('should rank exact matches higher than prefix matches', () => {
    const exact = computeScore(['auth'], ['auth', 'login'])
    const prefix = computeScore(['auth'], ['authentication', 'login'])
    expect(exact).toBeGreaterThan(prefix)
  })
})

describe('searchAndRank', () => {
  const items = [
    { id: 1, text: 'Implement OAuth2 authentication flow' },
    { id: 2, text: 'Fix database migration script' },
    { id: 3, text: 'Add CSV export for admin dashboard' },
    { id: 4, text: 'Auth middleware rate limiting' },
    { id: 5, text: 'Update deployment documentation' },
  ]

  it('should return items ranked by relevance', () => {
    const results = searchAndRank('auth', items, i => i.text, { minScore: 0.3 })
    expect(results.length).toBeGreaterThan(0)
    // "Auth middleware" has exact match, should rank first
    expect(results[0].id).toBe(4)
    // "authentication" has prefix match, should rank second
    expect(results[1].id).toBe(1)
  })

  it('should respect limit parameter', () => {
    const results = searchAndRank('auth', items, i => i.text, { limit: 1, minScore: 0.3 })
    expect(results).toHaveLength(1)
  })

  it('should filter by minScore', () => {
    const results = searchAndRank('auth', items, i => i.text, { minScore: 2.0 })
    // Only exact matches score >= 2.0
    for (const r of results) {
      expect(r._score).toBeGreaterThanOrEqual(2.0)
    }
  })

  it('should return empty for no matches', () => {
    const results = searchAndRank('zzzznothing', items, i => i.text)
    expect(results).toEqual([])
  })

  it('should fallback to substring when all tokens are stop words', () => {
    const items2 = [
      { id: 1, text: 'things to do today' },
      { id: 2, text: 'unrelated content' },
    ]
    // "to do" — both are stop words
    const results = searchAndRank('to do', items2, i => i.text)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(1)
  })

  it('should return empty for empty query', () => {
    const results = searchAndRank('', items, i => i.text)
    expect(results).toEqual([])
  })

  it('should include _score in results', () => {
    const results = searchAndRank('database', items, i => i.text, { minScore: 0.3 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('_score')
    expect(typeof results[0]._score).toBe('number')
  })
})
