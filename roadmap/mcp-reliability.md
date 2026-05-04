# MCP Reliability Tracker

## Status
In progress. Created from `roadmap/agent-teammate-audit.md` Phase A.

## Findings

### 1. `search_tasks` / `search_context` N+1 fan-out
- Repro: run either MCP tool against many boards; each board triggers `GET /api/files/:id`.
- Fix: route through server `/api/search` with filters and compact/detail support.
- Verify: MCP search performs one HTTP request to `/api/search` for normal searches.

### 2. `update_task_metadata` silent-failure risk
- Repro: submit invalid metadata and confirm MCP response sets `isError: true`.
- Fix: keep API client throwing on non-2xx and tool handlers returning `errorResponse`.
- Verify: invalid due date returns an MCP error response, not `{ ok: true }`.

### 3. `add_column` race condition
- Repro: two MCP clients add columns concurrently; old flow read markdown then PUT.
- Fix: server-side `POST /api/files/:fileId/columns` guarded by write lock + optional ETag.
- Verify: concurrent adds both serialize safely or stale ETag returns 409.

### 4. `add_knowledge` / `import_memories` non-atomic
- Repro: fail after task creation but before description/learnings update; partial knowledge remains.
- Fix sketch: add one-AST-save knowledge creation/bulk import endpoint.
- Verify: injected failure leaves no partial task.

### 5. Resources / prompts error paths
- Current code already wraps resource and prompt API reads in fallback messages.
- Verify with server down before changing.

### 6. `archive_completed_tasks` subtasks
- Repro: completed subtask older than threshold remains unarchived.
- Fix: regression test against flattened child tasks; patch if failing.
- Verify: parent and child completed tasks can both be archived.
