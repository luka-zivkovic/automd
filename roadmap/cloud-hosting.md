# AutoMD Cloud Hosting — Implementation Plan

> **Status**: Planning — not yet implementing. This document is the full reference plan.

## Context

AutoMD is open-source and self-hosted (single Docker container, filesystem storage, no DB). Many users won't deal with Docker/VPS setup. Goal: click a button → running instance at `username.automd.app`.

**Decisions:**
- **Platform**: Fly.io Machines API (global/US-heavy audience)
- **S3 sync**: Built into core AutoMD — self-hosted users get backup, cloud users get durability
- **Billing**: Polar.sh (`@polar-sh/sdk`, 4% + $0.40/tx, MoR handles taxes)
- **Cloud layer**: Separate repo (`automd-cloud`)
- **S3 provider**: Cloudflare R2 (free egress, $15/TB/mo)

---

## Phase 1: S3 Storage Sync (core AutoMD repo)

### Design

Write-behind observer pattern. Every successful local write fires an async S3 upload. The write lock guarantees serial mutation, so S3 ops can queue after each write without ordering races. S3 failures never block local operations.

```
Write request → withWriteLock() → write to local /data (fast, <1ms)
                                 ↓ async, fire-and-forget
                                 enqueue S3 upload (debounced)

Container start → hydrate /data from S3 if S3 is newer
```

### New file: `packages/server/src/s3-sync.ts`

**Env vars** (all optional — sync disabled when absent):
```
AUTOMD_S3_ENDPOINT       # e.g. https://<acct>.r2.cloudflarestorage.com
AUTOMD_S3_BUCKET         # bucket name
AUTOMD_S3_ACCESS_KEY_ID
AUTOMD_S3_SECRET_ACCESS_KEY
AUTOMD_S3_PREFIX         # optional, for multi-tenant: users/<user-id>/
```

**Exports:**
- `isS3SyncEnabled(): boolean`
- `initS3Sync(): void` — create S3 client from env vars
- `syncFileToS3(relativePath, content): void` — enqueue PutObject (fire-and-forget)
- `deleteFileFromS3(relativePath): void` — enqueue DeleteObject
- `fullSyncToS3(): Promise<void>` — upload all files (startup reconciliation)
- `getS3SyncStatus(): { enabled, lastSync, errors }`

**Internals:** Promise-chain queue (same pattern as `write-lock.ts`), catches errors to never propagate to callers. Uses `@aws-sdk/client-s3` (PutObjectCommand, DeleteObjectCommand).

Auth data (`auth.json`) is never synced — it's instance-specific.

### Modify: `packages/server/src/storage.ts`

4 insertion points after existing writes:

| Location | Line | Change |
|----------|------|--------|
| `writeManifest()` | after L71 `renameSync` | `syncFileToS3('manifest.json', JSON.stringify(manifest, null, 2))` |
| `createFile()` | after L181 `writeFileSync` | ``syncFileToS3(`boards/${filename}`, content)`` |
| `updateFileMarkdown()` | after L218 `writeFileSync` | ``syncFileToS3(`boards/${entry.filename}`, markdown)`` |
| `deleteFile()` | after L260 `unlinkSync` | ``deleteFileFromS3(`boards/${entry.filename}`)`` |

Import at top: `import { syncFileToS3, deleteFileFromS3 } from './s3-sync.js'`

Each sync call is a no-op when S3 is unconfigured (checked internally).

### Modify: `packages/server/src/index.ts`

After `server.listen()` callback — call `initS3Sync()`, log status, run `fullSyncToS3()` in background.

### Modify: `packages/server/src/app.ts`

Extend `/api/health` to include `s3Sync: getS3SyncStatus()`.

### Modify: `packages/server/package.json`

Add `"@aws-sdk/client-s3": "^3.700.0"` to dependencies.

### New test: `packages/server/src/__tests__/s3-sync.test.ts`

Mock S3 client. Verify: enabled/disabled detection, PutObject with correct keys, DeleteObject, queue serialization, error isolation, fullSync reads all board files.

### Verification

1. Run existing test suite with S3 env vars unset — zero regression
2. Unit tests for `s3-sync.ts` with mocked S3 client
3. Integration: create board via API → verify mock received PutObject for `manifest.json` + `boards/<name>.md`
4. Manual: set R2 env vars, create/update/delete boards, check R2 console

---

## Phase 2: `automd-cloud` Repo Scaffold

### Structure
```
automd-cloud/
├── package.json
├── tsconfig.json
├── Dockerfile
├── fly.toml
├── .env.example
└── src/
    ├── index.ts               # Entry point
    ├── app.ts                 # Express app
    ├── config.ts              # Env var loading
    ├── db/
    │   ├── client.ts          # better-sqlite3 singleton
    │   └── schema.ts          # Schema + migrations
    ├── routes/
    │   ├── webhooks.ts        # Polar.sh webhooks
    │   ├── provision.ts       # Admin machine management
    │   ├── dashboard.ts       # User dashboard API
    │   ├── internal.ts        # Router route-table endpoint
    │   └── health.ts
    ├── services/
    │   ├── fly-machines.ts    # Fly Machines API client
    │   ├── polar.ts           # Polar SDK wrapper
    │   └── provisioner.ts     # Machine lifecycle orchestration
    ├── middleware/
    │   ├── auth.ts            # JWT/magic-link auth
    │   └── webhook-verify.ts  # Polar signature verification
    └── router/
        ├── main.ts            # Subdomain router app
        ├── fly.toml
        └── Dockerfile
```

### Dependencies
```
@polar-sh/sdk, better-sqlite3, express, jsonwebtoken, nanoid
```

### Database (SQLite on Fly volume)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  polar_customer_id TEXT UNIQUE,
  polar_subscription_id TEXT,
  subdomain TEXT UNIQUE,            -- "alice" → alice.automd.app
  status TEXT DEFAULT 'pending',    -- pending | active | suspended | canceled
  fly_app_name TEXT,
  fly_machine_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  type TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);
```

---

## Phase 3: Fly.io Provisioning API

### `src/services/fly-machines.ts`

Plain `fetch` wrapper for `https://api.machines.dev/v1`. Rate-limited to 1 req/s (Fly limit).

**Functions:** `createApp()`, `createVolume()`, `createMachine()`, `startMachine()`, `stopMachine()`, `destroyMachine()`, `getMachineStatus()`

**Machine config per user:**
```json
{
  "image": "ghcr.io/luka-zivkovic/automd:latest",
  "guest": { "cpu_kind": "shared", "cpus": 1, "memory_mb": 256 },
  "env": {
    "AUTOMD_S3_ENABLED": "true",
    "AUTOMD_S3_PREFIX": "users/<user-id>/",
    "AUTOMD_DISABLE_UPDATE_CHECK": "true"
  },
  "services": [{ "internal_port": 4800, "autostop": "stop", "autostart": true }],
  "mounts": [{ "volume": "<vol-id>", "path": "/data" }]
}
```

### `src/services/provisioner.ts`

Orchestrates full lifecycle:
- `provisionUser(user)` → create Fly app → volume → machine → cert → update DB status='active'
- `deprovisionUser(user)` → stop → destroy → update DB
- `suspendUser(user)` → stop machine → status='suspended'
- `resumeUser(user)` → start machine → status='active'

### Cost model
| Users | 24/7 | With autostop (~4h/day) |
|-------|------|------------------------|
| 10 | ~$23/mo | ~$5/mo |
| 100 | ~$232/mo | ~$50/mo |
| 1000 | ~$2,320/mo | ~$500/mo |

R2 storage: negligible ($0.75/mo at 50GB for 10K users).

---

## Phase 4: Router App

### Architecture
```
*.automd.app → Fly DNS → Router App → fly-replay header → User's Machine
```

### `src/router/main.ts`

Minimal HTTP server (~50 lines). Reads subdomain from `Host` header, looks up target Fly app from in-memory cache, responds with `fly-replay: app=<app-name>`.

Cache refreshed periodically from cloud service's internal endpoint (`GET /api/internal/routes`).

Non-existent subdomains → 404. Root/www → redirect to marketing site.

### DNS/TLS
- `*.automd.app` CNAME → router app's Fly hostname
- Fly handles wildcard TLS termination automatically
- Per-user certs added during provisioning via Fly certs API

---

## Phase 5: Polar.sh Billing

### `src/routes/webhooks.ts`

Listens on `POST /webhooks/polar`. Verifies signature, then:

| Event | Action |
|-------|--------|
| `subscription.created` | Create user in DB → trigger `provisionUser()` |
| `subscription.active` | If suspended → `resumeUser()` |
| `subscription.canceled` | Set status='canceled', schedule deprovision after grace period |
| `subscription.revoked` | Immediate `suspendUser()` |

### Deprovision cron

Hourly interval checks for canceled users past grace period → runs `deprovisionUser()`.

---

## Phase 6: User Dashboard

### Auth: Magic link (no passwords)

User enters email → cloud service sends link with signed JWT (15 min) → click sets session cookie (7 day JWT). The billing email IS the identity.

### `src/routes/dashboard.ts`

- `GET /api/dashboard` — instance info (subdomain, status, machine state, URL)
- `POST /api/dashboard/subdomain` — claim/change subdomain (validate, check uniqueness, update cert)

### Frontend

Minimal page (can be static HTML for v1):
- Login form (email → magic link)
- Instance status card (running/stopped/starting)
- Subdomain + copy URL button
- Link to Polar customer portal for subscription management

---

## Implementation Order

```
Phase 1 (S3 sync)  ─────────────────────────►  Ship to main repo
                                                   │
Phase 2 (repo scaffold)  ──► Phase 3 (Fly API) ──►│──► Phase 4 (router)
                              Phase 5 (Polar)   ──►│──► Phase 6 (dashboard)
```

Phase 1 first — it's a standalone feature AND a prerequisite for cloud (each machine needs S3 sync with per-user prefix). Phases 2-5 can partially overlap.

---

## Files Modified in Core AutoMD

| Action | File |
|--------|------|
| CREATE | `packages/server/src/s3-sync.ts` |
| CREATE | `packages/server/src/__tests__/s3-sync.test.ts` |
| MODIFY | `packages/server/src/storage.ts` (4 sync call insertions) |
| MODIFY | `packages/server/src/index.ts` (startup init) |
| MODIFY | `packages/server/src/app.ts` (health endpoint) |
| MODIFY | `packages/server/package.json` (add @aws-sdk/client-s3) |
| MODIFY | `.env.example` (document S3 vars) |
| MODIFY | `docker-compose.yml` (document S3 vars) |

---

## Open Questions

1. **Pricing**: Free tier? $5/mo? Usage-based? (Doesn't block architecture)
2. **Autostop UX**: 2-3s cold start after idle — show loading screen? Accept it?
3. **Region selection**: Let users pick Fly region or auto-detect?
4. **Custom domains**: Allow `tasks.mycompany.com` → user's instance? (Fly supports this, adds complexity)
5. **Subdomain rules**: Reserved words list? Min/max length?
