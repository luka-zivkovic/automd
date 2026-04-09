# Audit: Search & Filtering

## CRITICAL

### 1. Hybrid search silently degrades but response still says `mode: "hybrid"`
**File:** `packages/server/src/routes/search.ts:64`
- When semantic results empty (fresh install), falls back to text-only
- Response `mode` field not updated — lies to caller
- **Fix:** Track `effectiveMode` and return it in response.

### 2. Server BM25 tokenizer diverged from shared/MCP tokenizer
**Files:** `server/routes/search.ts:101` vs `shared/text-search.ts:20` vs `mcp/text-search-utils.ts:9`
- Server: ASCII-only, no stop words, no min length
- MCP/shared: Unicode-aware, 50+ stop words, min length 2
- Same query produces different rankings between paths
- **Fix:** Delete private `tokenize()` from search.ts, import from `@automd/shared`.

### 3. `parseInt` limit=0 silently becomes 20
**File:** `packages/server/src/routes/search.ts:44`
- `parseInt('0') || 20` → `20` (falsy zero)
- Negative values produce unexpected `.slice()` behavior
- **Fix:** Explicit NaN/negative guard with `Math.max(1, ...)`

## HIGH

### 4. MCP `search_tasks` label filter is case-sensitive; server is case-insensitive
**File:** `packages/mcp/src/tools.ts:537` vs `server/routes/search.ts:220`
- `labels.includes(label)` vs `toLowerCase() ===`
- **Fix:** Normalize to case-insensitive in MCP tool.

### 5. `useGlobalSearch` only matches checklist tasks — kanban H2 tasks invisible
**File:** `src/hooks/useGlobalSearch.ts:12`
- Regex only matches `- [ ] task` lines
- All kanban board tasks invisible to Ctrl+K
- **Fix:** Add H2 heading regex or use server search endpoint.

### 6. MCP search tools silently drop items that fail to load
**File:** `packages/mcp/src/tools.ts:563-566`
- Per-item errors swallowed, no warning in response
- Agent gets incomplete results with no indication
- **Fix:** Include `warnings` field in response.

### 7. `search_context` `completedOnly` parameter ignored when embeddings enabled
**File:** `packages/mcp/src/tools.ts:591-594`
- Server endpoint has no `completedOnly` parameter
- Filter only applied in fallback path
- **Fix:** Add parameter to server route or filter results client-side.

### 8. RRF scores incomparable across modes
**File:** `packages/server/src/routes/search.ts:383`
- Hybrid returns RRF scores (0.01-0.04), text returns BM25 (0.5-5.0)
- `score` field meaningless for cross-mode comparison
- **Fix:** Normalize to 0-1 range or document mode-dependent scale.

## MEDIUM

### 9. Three separate tokenizer implementations
- Server, shared, MCP all diverged
- **Fix:** Single source of truth from `@automd/shared`.

### 10. `textSearch` parses every board on every request
**File:** `packages/server/src/routes/search.ts:210`
- Full AST parse per file per search
- **Fix:** Cache extracted results keyed by content hash.

### 11. `useGlobalSearch` runs on every keystroke with no debounce
**File:** `src/hooks/useGlobalSearch.ts:22-51`
- `useMemo` fires synchronously on every character
- **Fix:** Add 150-200ms debounce.

### 12. `jaccardSimilarity` returns 1.0 for two empty token sets
**File:** `packages/mcp/src/text-similarity.ts:27-29`
- Stop-word-only titles match as identical
- **Fix:** Return 0.0 for empty sets.
