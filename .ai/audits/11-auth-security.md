# Audit: Auth & Security

## CRITICAL

### 1. Session tokens stored in plaintext on disk
**File:** `packages/server/src/auth-storage.ts:134,157`
- API keys are hashed; sessions are NOT
- auth.json leak = all active sessions compromised
- **Fix:** Store SHA-256 hash of token. Hash incoming token before comparison.

### 2. No constant-time comparison anywhere
**File:** `packages/server/src/auth-storage.ts:181,189,149`
- `validateToken`: `s.token === token` (short-circuit)
- `validateApiKey`: `k.keyHash === keyHash` (short-circuit)
- `login`: `hash !== auth.admin.passwordHash` (short-circuit)
- **Fix:** Use `crypto.timingSafeEqual` for all three.

### 3. Setup endpoint TOCTOU race — double admin creation
**File:** `packages/server/src/routes/auth.ts:27-48`
- `isSetupComplete()` check then `createAdmin()` — not atomic
- Two simultaneous POSTs can both pass the check
- Second caller gets valid token for overwritten account
- **Fix:** Wrap in `withWriteLock`.

## HIGH

### 4. No rate limiting on login or setup
**File:** `packages/server/src/routes/auth.ts:52-66`
- Unlimited brute-force attempts at CPU speed
- **Fix:** Add express-rate-limit (10 per 15min on login).

### 5. API keys hashed with raw SHA-256 — no pepper or stretching
**File:** `packages/server/src/auth-storage.ts:100-102`
- Instantaneous to compute; saved by 192-bit key length only
- **Fix:** Use scrypt/argon2 or HMAC with server-side pepper.

### 6. Wildcard CORS — any website can make API requests
**File:** `packages/server/src/app.ts:28`
- `cors()` defaults to `Access-Control-Allow-Origin: *`
- **Fix:** Restrict to localhost/configured domain via env var.

### 7. scryptSync uses default cost (N=16384) — below OWASP minimum
**File:** `packages/server/src/auth-storage.ts:89`
- OWASP recommends N=65536 minimum
- **Fix:** Pass explicit `{ N: 65536, r: 8, p: 1 }`.

### 8. Auth bypassed if auth.json deleted — re-enters setup mode
**File:** `packages/server/src/auth-middleware.ts:16-19`
- `isSetupComplete()` reads file on every request
- Deleting auth.json = full auth bypass
- **Fix:** Cache result in memory, only re-read on mutation.

### 9. readAuth() called twice per authenticated request
**File:** `packages/server/src/auth-middleware.ts:28`
- validateToken reads file, then validateApiKey reads again
- Synchronous blocking I/O on hot path
- **Fix:** Cache with short TTL or merge into single read.

## MEDIUM

### 10. No maximum password length — scrypt DoS
### 11. Session list grows unboundedly
### 12. readAuth() synchronous file I/O on every request
