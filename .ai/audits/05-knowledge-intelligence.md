# Audit: Knowledge & Intelligence

## CRITICAL

### 1. Orphaned relationships when board deleted without embeddings enabled
**File:** `packages/server/src/embeddings/index.ts:99`
- `removeRelationshipsForItem` only called when `store` is non-null
- Without embeddings: deleting board leaves relationships permanently in DB
- **Fix:** Call `removeRelationshipsForItem` unconditionally from file deletion route.

### 2. Self-relationship creation not blocked
**File:** `packages/server/src/routes/relationships.ts:26-41`
- No validation that source != target
- Self-loop stored, causes self-boost in graph scoring
- **Fix:** Reject when `sourceItemId === targetItemId && sourceTaskId === targetTaskId`.

## HIGH

### 3. Negative limit produces unexpected results
**File:** `packages/server/src/routes/context.ts:47`
- `parseInt('-5')` → `-5`; `.slice(0, -5)` returns all but last 5 elements
- **Fix:** `Math.max(1, Math.min(parseInt(...) || 50, 200))`

### 4. Content tiering `learning` tier doesn't exist — collapsed into `knowledge`
**File:** `packages/server/src/embeddings/vector-store.ts:13` / `indexer.ts:29`
- `ContentTier` only has `'knowledge' | 'task' | 'page'`
- Tasks with learnings get same boost as curated knowledge:true items
- **Fix:** Add `'learning'` tier with distinct (lower) boost factor.

### 5. `import_memories` doesn't check result.taskId before using it
**File:** `packages/mcp/src/tools.ts:1056-1065`
- `result.taskId` could be undefined; pushed to results silently
- **Fix:** Check `if (!result?.taskId)` and push to errors.

### 6. Relationship duplicate check not atomic — TOCTOU race
**File:** `packages/server/src/relationships.ts:76-103`
- Check and insert are separate queries, no transaction
- Concurrent requests can create duplicate rows
- **Fix:** Add UNIQUE constraint + `INSERT OR IGNORE`.

## MEDIUM

### 7. Silent swallow of relationship errors in context assembly
**File:** `packages/server/src/routes/context.ts:367-369`
- Empty catch hides DB corruption
- **Fix:** Log the error.

### 8. `get_working_context` allows mismatched itemId/taskId
**File:** `packages/mcp/src/tools.ts:1130-1133`
- Schema allows only `itemId` without `taskId`
- Server returns 400 for this combination
- **Fix:** Add `.refine()` or document mutual requirement.

### 9. `applyGraphBoost` issues O(N) SQLite queries per search
**File:** `packages/server/src/routes/search.ts:415-428`
- Two queries per hit for relationships
- **Fix:** Batch-fetch with `WHERE source_item_id IN (...)`.

### 10. `collectExistingKnowledge` fetches all boards per add_knowledge call
**File:** `packages/mcp/src/tools.ts:68-96`
- N+1 HTTP requests for dedup
- **Fix:** Server-side dedup endpoint or caching.

### 11. Limit applied independently to 3 categories — actual count is 3x
**File:** `packages/server/src/routes/context.ts:147,163,166`
- Default limit=50 can return up to 150 items
- **Fix:** Define total limit or document per-section limits.
