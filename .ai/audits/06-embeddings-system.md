# Audit: Embeddings System

## CRITICAL

### 1. API key leaked in error message body returned to client
**File:** `packages/server/src/embeddings/openai-provider.ts:64`
- Raw OpenAI error body thrown as error message
- Propagates to HTTP response via settings test endpoint
- **Fix:** Sanitize error messages before returning to client.

### 2. Dimension mismatch silent corruption for pre-migration databases
**File:** `packages/server/src/embeddings/vector-store.ts:114-129`
- `dimensions` column is NULL for pre-migration rows
- Mismatch check skipped when NULL → old vectors mixed with new
- **Fix:** Backfill NULL dimensions during migration, or treat NULL as mismatch.

## HIGH

### 3. `deleteById` not transactional — orphaned rows on crash
**File:** `packages/server/src/embeddings/vector-store.ts:203-206`
- Two separate DELETEs without transaction wrapper
- Orphan in `embedding_meta` makes indexer think item is up-to-date
- **Fix:** Wrap in `db.transaction()`.

### 4. `reinitEmbeddings` nulls store while background reindex holds stale reference
**File:** `packages/server/src/embeddings/index.ts:42-58`
- Second settings save closes DB that first reindex is writing to
- `store!` assertions throw SQLITE_MISUSE silently
- **Fix:** Capture local references, add cancellation flag.

### 5. `detectSimilarityRelationships` runs O(N²) synchronous SQLite queries
**File:** `packages/server/src/embeddings/index.ts:209-257`
- N ANN queries block event loop for entire duration
- 500 items freezes HTTP server for seconds
- **Fix:** Yield with `setImmediate` or use worker thread.

### 6. Settings endpoint has no input validation — SSRF via baseUrl/url
**File:** `packages/server/src/routes/settings.ts:35-36`
- No validation of provider enum value
- `openai.baseUrl` and `ollama.url` accept any URL including internal IPs
- **Fix:** Validate provider enum, block private IP ranges.

## MEDIUM

### 7. Hardcoded dimension fallback for unknown models
**File:** `packages/server/src/embeddings/openai-provider.ts:24`
- Unknown model gets 1536 dims; actual may differ
- **Fix:** Probe embed call to detect actual dimensions.

### 8. Empty string API key clears stored key
**File:** `packages/server/src/routes/settings.ts:41`
- `""` bypasses `isMaskedValue` check, deletes key
- **Fix:** Treat empty string as no-op.

### 9. `extractEmbeddables` calls `storage.listFiles()` on every index
**File:** `packages/server/src/embeddings/indexer.ts:61-65`
- Reads all files from disk just to get board name
- **Fix:** Use `storage.getFile(itemId)`.

### 10. `backgroundReindex` uses `store!` after store could be nulled
**File:** `packages/server/src/embeddings/index.ts:187`
- Module-level refs can change between await yields
- **Fix:** Capture local references at start.

### 11. No rate-limit handling for OpenAI 429 responses
**File:** `packages/server/src/embeddings/openai-provider.ts:47-75`
- Throws immediately on 429, no retry
- Background reindex fails silently for remaining boards
- **Fix:** Add exponential backoff retry for 429/5xx.

### 12. `migrateTierColumn` swallows all exceptions
**File:** `packages/server/src/embeddings/vector-store.ts:82-84`
- Only "table not exists" justified; other errors hidden
- **Fix:** Only suppress specific SQLITE_ERROR.
