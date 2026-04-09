# Audit: Real-Time & Sync

## CRITICAL

### 1. Token exposed in WebSocket URL — visible in server/proxy logs
**File:** `packages/server/src/ws.ts:33`, `src/hooks/useServerSync.ts:136`
- Token passed as `?token=<secret>` query parameter
- Logged by reverse proxies, Node http, access logs
- **Fix:** Use Authorization header on upgrade or first-message auth pattern.

### 2. Unauthenticated clients can spoof any username in presence
**File:** `packages/server/src/ws.ts:75-80`
- Username is client-supplied, never cross-referenced with token identity
- Any client can claim to be "admin"
- **Fix:** Derive username from validated token, not client payload.

### 3. broadcast() fires inside withWriteLock — WS latency blocks write queue
**File:** `packages/server/src/routes/tasks.ts:111`, `routes/columns.ts:22`
- tasks.ts and columns.ts broadcast inside lock; files.ts broadcasts outside
- **Fix:** Move broadcast after lock release.

### 4. Column routes have no ETag conflict detection
**File:** `packages/server/src/routes/columns.ts:39-57`
- Tasks and files check If-Match; columns don't
- Last-write-wins silently on concurrent column edits
- **Fix:** Add If-Match check (same pattern as tasks.ts).

## HIGH

### 5. withWriteLock is process-local — no protection for multi-instance S3 deployments
**File:** `packages/server/src/write-lock.ts:6`
- S3 sync implies multi-instance but lock is single-process
- **Fix:** Add startup warning; long-term: distributed lock.

### 6. S3 hydration uses filesystem mtime — unreliable in Docker
**File:** `packages/server/src/s3-sync.ts:167-169`
- Container restart resets mtime to image build time
- **Fix:** Store per-file S3 ETag in metadata file.

### 7. Retry action in save-error sends PUT without ETag
**File:** `src/hooks/useServerSync.ts:384-390`
- Retry blindly overwrites server state, defeating conflict detection
- **Fix:** Re-fetch ETag before retry or pass from 409 response.

### 8. file:updated broadcasts full markdown to ALL clients
**File:** `packages/server/src/routes/tasks.ts:50`
- No size limit, no per-client filtering
- **Fix:** Broadcast only ID + updatedAt; clients re-fetch if interested.

### 9. deleteFile reads file outside write lock for webhook
**File:** `packages/server/src/routes/files.ts:251-252`
- Race between getFile and withWriteLock
- **Fix:** Move getFile inside lock.

## MEDIUM

### 10. S3 hydration no path traversal check — arbitrary file write
**File:** `packages/server/src/s3-sync.ts:159-179`
### 11. Reconnect re-fetches all files (N+1)
### 12. No rate limit on presence:join messages
### 13. S3 errors silently swallowed everywhere
### 14. Stale WS token after session expiry — connection stays alive
