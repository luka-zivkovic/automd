# Audit: Health, Updates & Cross-Cutting Validation

## CRITICAL

### 1. Version always falls back to 0.1.0 — update banner lies
**File:** `packages/server/src/version.ts:1-4`
- Hardcoded fallback when AUTOMD_VERSION not set
- All dev runs show permanent false update notification
- **Fix:** Read from package.json or use 0.0.0 fallback.

### 2. readAuth() called on every request — no caching
**File:** `packages/server/src/auth-storage.ts:115-117`
- Two full disk reads + JSON parse per authenticated request
- **Fix:** Cache in memory, invalidate on writeAuth().

## HIGH

### 3. Relationship routes skip isValidId validation
**File:** `packages/server/src/routes/relationships.ts:58-65`
- GET/DELETE params and POST body fields not validated
- Only route in codebase that skips this pattern
- **Fix:** Add isValidId() checks on all params/body fields.

### 4. deleteApiKey accepts any string as ID
**File:** `packages/server/src/routes/auth.ts:115-123`
- Missing isValidId check
- **Fix:** Add validation before deleteApiKey call.

### 5. CORS fully open — any website can read API responses
**File:** `packages/server/src/app.ts:28`
- `cors()` defaults to `Access-Control-Allow-Origin: *`
- Board content, tasks, knowledge all readable cross-origin
- **Fix:** `cors({ origin: process.env.AUTOMD_ORIGIN || 'http://localhost:5173' })`

### 6. Task content has no length limit
**File:** `packages/server/src/routes/tasks.ts:77-79`
- 5MB task title accepted via body limit
- Amplifies across parser, embeddings, webhooks
- **Fix:** Check `content.length <= 2000`.

### 7. Column title has no length limit
**File:** `packages/server/src/routes/columns.ts:47-50`
- **Fix:** Apply `isValidName(title)`.

### 8. isNewerVersion fails on pre-release tags (NaN comparison)
**File:** `packages/server/src/update-check.ts:29-36`
- `v2.0.0-beta` → `[2, 0, NaN]`, all comparisons false
- **Fix:** Strip pre-release suffix before parsing.

### 9. Embeddings baseUrl not validated — SSRF vector
**File:** `packages/server/src/routes/settings.ts:44-49`
- Can point to internal network addresses
- **Fix:** Validate URL scheme and block private IP ranges.

## MEDIUM

### 10. /api/health exposes filesystem path (unauthenticated)
### 11. Tags array has no count/length limit
### 12. Update check interval has no minimum (can be 1ms)
### 13. Relationship routes leak internal error messages
### 14. POST /api/files accepts invalid itemType values
