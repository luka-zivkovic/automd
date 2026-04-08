# AutoMD Feature Review Tracker

Last updated: 2026-04-08
Status legend: ⬜ Not Reviewed | ✅ Working | ❌ Broken | ⚠️ Needs Work

## Summary

- **Total: 80** | ⬜ 2 | ✅ 52 | ❌ 0 | ⚠️ 26

---

## 1. Core Views

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | Dashboard (stats, activity, agent status) | ✅ | Fixed: BoardCard now opens correct view per itemType |
| 1.2 | Kanban Board (drag-and-drop columns/cards) | ✅ | Fixed: dragOver no longer thrashes AST; commits only on drop |
| 1.3 | Checklist View (linear task list, archive toggle) | ✅ | Functional, no critical issues found |
| 1.4 | Editor View (CodeMirror raw markdown) | ✅ | Fixed: debounce cancelled on unmount |
| 1.5 | Document/Split View (rendered markdown + split editor) | ✅ | Functional |
| 1.6 | Knowledge Base View (search, tagging) | ✅ | Functional |
| 1.7 | Memory View (AI-tracked learnings) | ✅ | Fixed: navigates to correct view per itemType |
| 1.8 | Prompt Library (searchable system prompts) | ✅ | Functional |
| 1.9 | Connect View (MCP/REST/Webhook setup) | ✅ | Functional |
| 1.10 | Settings View (app configuration) | ⚠️ | Only shows embeddings config; spinner when no server |

## 2. Task Management

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | Task CRUD (create, read, update, delete) | ✅ | Fixed: cache invalidation, write ordering, content length validation |
| 2.2 | Task completion toggle (auto completedAt) | ✅ | Fixed: webhook always fires correct event; subtask completedAt works |
| 2.3 | Subtasks (nested checkbox lists) | ✅ | Fixed: recursive taskMap used for all subtask lookups |
| 2.4 | Drag-and-drop (move tasks between columns) | ✅ | Fixed: no more AST thrashing on drag-over |
| 2.5 | Task details panel (side panel editing) | ✅ | Functional |
| 2.6 | Bulk task updates (batch ops via API) | ⚠️ | Works but sequential HTTP calls, no batching |
| 2.7 | Task archival (archive/unarchive) | ✅ | Functional |
| 2.8 | Column management (add, rename, delete) | ✅ | Fixed: write-lock, ETag, ID validation, title length cap |

## 3. Task Metadata

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 3.1 | Assignees (`@username` inline syntax) | ⚠️ | Regex matches inside words (email@domain false positive) |
| 3.2 | Labels/Tags (`#label` with color coding) | ⚠️ | Regex matches hex colors (#FF0000) and issue refs (#123) |
| 3.3 | Priority (`priority:high/medium/low`) | ✅ | Fixed: validated at API boundary |
| 3.4 | Due dates (`due:YYYY-MM-DD`, overdue highlight) | ⚠️ | Accepts invalid dates (2024-99-99); no calendar validation |
| 3.5 | Estimates (`est:4h` effort tracking) | ⚠️ | No upper bound; `est:1.2.3` silently truncates |
| 3.6 | Built-by / Created-by (agent + user attribution) | ✅ | Functional |
| 3.7 | Acceptance criteria (blockquote-based) | ✅ | Fixed: type validated at API |
| 3.8 | Learnings (structured bullets with #tags) | ✅ | Fixed: type validated at API |
| 3.9 | Descriptions (plain paragraph context) | ⚠️ | Round-trip loses inline markdown (bold, links) |

## 4. Search & Filtering

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 4.1 | Global search (Ctrl+K command palette) | ⚠️ | Only searches checklist tasks; kanban H2 tasks invisible |
| 4.2 | Text search (BM25-lite tokenized) | ⚠️ | Server tokenizer diverged from MCP tokenizer (no stop words) |
| 4.3 | Semantic search (vector embeddings) | ✅ | Functional |
| 4.4 | Hybrid search (text + semantic via RRF) | ✅ | Fixed: reports effective mode (not requested mode) |
| 4.5 | Filter by assignee/label/priority/status | ⚠️ | MCP label filter is case-sensitive; server is case-insensitive |
| 4.6 | Knowledge-only search (knowledge:true filter) | ✅ | Functional |
| 4.7 | Context search (descriptions, AC, learnings) | ⚠️ | completedOnly param ignored when embeddings enabled |

## 5. Knowledge & Intelligence

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | Knowledge items (knowledge:true flagged) | ✅ | Functional |
| 5.2 | Working context assembly (target + related + learnings) | ✅ | Functional |
| 5.3 | Topic synthesis (markdown briefs) | ✅ | Functional (name is misleading — it's a filtered dump, not synthesis) |
| 5.4 | Relationships (depends-on, related-to, supersedes, learned-from) | ✅ | Fixed: self-relationships blocked, ID validation added |
| 5.5 | Auto-detected relationships (similarity-based) | ⚠️ | O(N²) synchronous SQLite queries block event loop on large datasets |
| 5.6 | Import memories (bulk import from external) | ⚠️ | N+1 HTTP requests for dedup; non-atomic multi-step write |
| 5.7 | Content tiering (knowledge > learning > regular boost) | ⚠️ | 'learning' tier doesn't exist — collapsed into 'knowledge' |

## 6. Embeddings System

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | OpenAI provider (configurable model/base URL) | ✅ | Fixed: API key sanitized in errors, SSRF blocked on baseUrl |
| 6.2 | Ollama provider (local embeddings) | ✅ | Functional |
| 6.3 | Vector store (in-memory + SQLite persistence) | ✅ | Fixed: dimension mismatch forces recreate |
| 6.4 | Auto-indexing (debounced background reindex) | ⚠️ | reinit race: store closed while reindex in-flight |
| 6.5 | Connection testing (test without saving) | ✅ | Functional |
| 6.6 | Similarity detection (cosine distance for auto-relationships) | ✅ | Fixed: orphan cleanup works without embeddings |

## 7. Projects & Organization

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 7.1 | Project CRUD (create, rename, delete, color-code) | ✅ | Functional |
| 7.2 | File-to-project association (move files) | ⚠️ | Sidebar drag reorder uses stale closure after move |
| 7.3 | Templates (Sprint Board, Bug Tracker, KB, etc.) | ✅ | Functional |
| 7.4 | Tag registry (curated + project + auto-detected) | ✅ | Functional |
| 7.5 | Board vocabulary (YAML frontmatter dimensions) | ✅ | Functional |

## 8. AI Agent Integration (MCP)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 8.1 | 31+ MCP tools (full CRUD, search, knowledge, relationships) | ✅ | Fixed: result limits, flattenApiTasks, sanitized inputs |
| 8.2 | 4 MCP resources (items, detail, markdown, projects) | ⚠️ | No error handling — server down crashes MCP process |
| 8.3 | System prompt (comprehensive agent instructions) | ⚠️ | Omits 7+ tools (get_related, link_tasks, get_working_context, etc.) |
| 8.4 | REST API (for ChatGPT and other tools) | ✅ | Functional |
| 8.5 | API key management (generate/revoke) | ✅ | Functional |

## 9. Webhooks

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 9.1 | HMAC-SHA256 signed hooks (12 event types) | ✅ | Fixed: SSRF blocked, timer leak fixed, unique deliveryIds |
| 9.2 | Slack/Discord templates (pre-configured formats) | ✅ | Functional |
| 9.3 | Retry logic & stats (delivery tracking) | ⚠️ | In-memory queue lost on restart; short retry delays (10s total) |

## 10. Real-Time & Sync

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 10.1 | WebSocket updates (multi-user real-time sync) | ⚠️ | Token in URL (logged by proxies); username spoofable |
| 10.2 | Presence broadcasting (connected agent list) | ⚠️ | Client-supplied username, no server-side identity binding |
| 10.3 | S3 cloud sync (write-behind replication) | ⚠️ | Process-local lock; unsafe for multi-instance; mtime unreliable in Docker |
| 10.4 | ETag conflict detection (optimistic concurrency) | ✅ | Fixed: columns now have ETag checks too |
| 10.5 | Markdown ↔ UI sync (minimal diff updates) | ✅ | Fixed: broadcast moved outside write-lock |

## 11. Auth & Security

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11.1 | Admin setup flow (one-time account creation) | ✅ | Fixed: TOCTOU race eliminated with write-lock |
| 11.2 | Email/password login (session token auth) | ✅ | Fixed: tokens hashed, constant-time compare, password length cap |
| 11.3 | API key auth (for agent access) | ✅ | Functional; SHA-256 hashed (no stretching but 192-bit keys) |
| 11.4 | Route protection (middleware-based) | ✅ | Fixed: auth cached in memory; CORS restricted |

## 12. Editor & Import/Export

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 12.1 | CodeMirror editor (syntax highlighting, folding) | ✅ | Fixed: debounce cleanup on unmount |
| 12.2 | Undo/Redo (full history Ctrl+Z/Y) | ✅ | Fixed: reads Immer draft state (not stale committed) |
| 12.3 | File import/export (.md/.markdown/.txt) | ✅ | Fixed: no double-write, 5MB size limit |
| 12.4 | Drag-drop import (drop files into app) | ✅ | Fixed: 5MB size limit added |

## 13. UI/UX

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 13.1 | Dark/Light/System theme (persistent preference) | ✅ | Functional; system listener not cleaned up on HMR |
| 13.2 | Keyboard shortcuts (Ctrl+1-4, Ctrl+K, etc.) | ✅ | Functional |
| 13.3 | Card display preferences (toggle metadata visibility) | ✅ | Functional |
| 13.4 | Sidebar with project tree (collapsible, drag-drop) | ⚠️ | Context menu clips near bottom; stale files in drag reorder |
| 13.5 | Activity feed (real-time action log) | ✅ | Functional |
| 13.6 | Responsive design (mobile-friendly) | ⬜ | Not audited in detail |

## 14. Health & Updates

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 14.1 | Version endpoint (`GET /api/version`) | ✅ | Fixed: reads from package.json, not hardcoded |
| 14.2 | GitHub release polling (6h interval, semver compare) | ✅ | Fixed: pre-release tags handled |
| 14.3 | Update banner (dismissible, links to release) | ✅ | Functional |
| 14.4 | Health endpoint (`GET /api/health`) | ✅ | Fixed: no longer leaks filesystem path |
| 14.5 | Disable update check (`AUTOMD_DISABLE_UPDATE_CHECK`) | ⬜ | Not tested |
