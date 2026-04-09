# Audit: Webhooks

## CRITICAL

### 1. SSRF: No private/internal network blocking on webhook URLs
**File:** `packages/server/src/routes/webhooks.ts:18-25`
- Only checks http/https protocol, no IP range blocking
- Can target 169.254.169.254 (AWS IMDS), localhost, internal services
- **Fix:** Block RFC-1918, loopback, link-local ranges. Resolve DNS at registration and delivery.

### 2. Webhook secret stored in plaintext on disk
**File:** `packages/server/src/webhook-storage.ts:73,127`
- Raw 64-char hex secret in webhooks.json
- Could be synced to S3, exposed in backups
- **Fix:** Document risk or encrypt with server-side master key.

### 3. Test ping event mismatch — header says `ping`, body says `board.updated`
**File:** `packages/server/src/webhook-delivery.ts:158-163`
- `X-AutoMD-Event: ping` but payload has `event: board.updated`
- **Fix:** Make header match body event field.

## HIGH

### 4. In-memory delivery queue lost on server restart
**File:** `packages/server/src/webhook-delivery.ts:13-18`
- No persistence, no recovery, no dead-letter queue
- **Fix:** Log warning on shutdown; long-term: persist to SQLite.

### 5. Stale stats flush overwrites concurrent CRUD mutations
**File:** `packages/server/src/webhook-storage.ts:149-185`
- 5-second debounced stats flush can revert URL changes and secret rotations
- **Fix:** Merge only stats fields in flush timer, not entire file.

### 6. Shared deliveryId across multiple webhooks for same event
**File:** `packages/server/src/webhook-delivery.ts:111-134`
- Same ID sent to webhook-A and webhook-B, breaks recipient idempotency
- **Fix:** Generate deliveryId per-webhook inside enqueue closure.

### 7. Timer leak on fetch throw — clearTimeout skipped
**File:** `packages/server/src/webhook-delivery.ts:45-83`
- fetch throws → clearTimeout never called → timer leaks
- **Fix:** Wrap in try/finally or use AbortSignal.timeout().

## MEDIUM

### 8. Retry delays too short (0, 2s, 8s) — not exponential
### 9. No circuit-breaker on failing webhooks
### 10. webhooks.json has no file locking

## LOW

### 11. User-Agent hardcodes version 0.1.0 (project is 0.2.1)
### 12. No test coverage for delivery engine, HMAC, retry logic
