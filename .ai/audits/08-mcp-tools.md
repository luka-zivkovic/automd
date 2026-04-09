# Audit: MCP Tools (AI Agent Integration)

## CRITICAL

### 1. search_tasks / search_context / find_knowledge: No result limit — unbounded N+1 fan-out
**File:** `packages/mcp/src/tools.ts:501-569, 572-677, 861-959`
- All three tools call `api.listFiles()` then `api.getFile()` for EVERY board serially
- No cap on results, no limit parameter
- 50 boards = 51 HTTP requests per search call
- Empty query returns every task in instance
- **Fix:** Add `limit` parameter (default 20, max 100). Use `Promise.allSettled` with concurrency limit. Route through server-side search.

### 2. update_task_metadata / update_knowledge: flatMap misses child tasks
**File:** `packages/mcp/src/tools.ts:378-382, 843-844`
- Shallow `flatMap(c => c.tasks)` misses subtask children
- `update_task_metadata` returns plain text "Task not found" without `isError: true`
- Agent believes operation succeeded
- `update_knowledge` returns `{ ok: true, updated: [] }` on failure
- **Fix:** Use `flattenApiTasks()`. Return `isError: true` for not-found.

### 3. add_column: read-then-write without lock or ETag — race condition
**File:** `packages/mcp/src/tools.ts:316-324`
- Reads markdown, appends string, writes back without If-Match
- Concurrent modifications silently overwritten
- **Fix:** Use ETag from getFile response, send If-Match on write.

### 4. add_knowledge / import_memories: non-atomic multi-step write
**File:** `packages/mcp/src/tools.ts:786-807, 1027-1041`
- Creates task, then updates description, then updates learnings (3 API calls)
- Failure after step 1 leaves orphaned empty knowledge item
- Dedup blocks retry because item already exists
- **Fix:** Include taskId in error response, or create atomic server endpoint.

## HIGH

### 5. Silent swallow of hybrid search failures
**File:** `packages/mcp/src/tools.ts:583-589, 871-876`
- Empty `catch` blocks at lines ~587 and ~875
- Agent gets degraded results with no indication
- `serverHasSearch()` caches false for 60s on transient failure
- **Fix:** Log error, include `fallback: true` field in response.

### 6. toggle_task description inverts semantics
**File:** `packages/mcp/src/tools.ts:254`
- Says "checked [ ] and unchecked [x]" — backwards
- Primary documentation for AI agents
- **Fix:** Change to "unchecked [ ] and checked [x]".

### 7. resources.ts: no error handling — uncaught exceptions crash MCP
**File:** `packages/mcp/src/resources.ts:10-72`
- All four resource handlers have zero try/catch
- Server down → unhandled exception → MCP process crash
- **Fix:** Wrap in try/catch, return meaningful error.

### 8. Prompt handlers: no error handling
**File:** `packages/mcp/src/prompts/operations.ts`, `workflows.ts`, `planning.ts`
- Same issue as resources — API failures propagate uncaught
- **Fix:** Wrap in try/catch.

### 9. archive_completed_tasks misses child tasks
**File:** `packages/mcp/src/tools.ts:1152-1174`
- Iterates `column.tasks` directly, not `flattenApiTasks()`
- Completed child tasks never archived
- **Fix:** Use `flattenApiTasks()`.

### 10. get_item_markdown overfetches — requests full L2 when only markdown needed
**File:** `packages/mcp/src/tools.ts:148-155`
- No `detail` parameter passed — server parses full AST unnecessarily
- **Fix:** Pass most efficient detail level.

## MEDIUM

### 11. API_KEY read at module load — cannot reconfigure at runtime
**File:** `packages/mcp/src/api-client.ts:1-2`
- Module-level constants captured at import time
- **Fix:** Use getter function or lazy initialization.

### 12. Stop-word-only queries get relevance 1.0 — no ranking
**File:** `packages/mcp/src/tools.ts:541-544`
- Fallback substring match assigns 1.0 to all results
- Results in board order, not relevance order

### 13. MCP server version hardcoded to '0.1.0'
**File:** `packages/mcp/src/index.ts:9`
- Project version is 0.2.1
- **Fix:** Import from package.json.

### 14. update_task: agentName silently dropped when content is undefined
**File:** `packages/mcp/src/tools.ts:239-241`
- `if (agentName && finalContent)` — finalContent optional
- built-by attribution lost
- **Fix:** Handle agentName independently of content.

### 15. collectExistingKnowledge: N+1 on every add_knowledge call
**File:** `packages/mcp/src/tools.ts:67-95`
- 20 boards = 21 HTTP requests just for dedup
- **Fix:** Cache or expose server-side dedup endpoint.

### 16. Duplicate text-search code — "keep in sync" comment
**File:** `packages/mcp/src/text-search-utils.ts:3-5`, `stop-words.ts:3-4`
- Manual copies of shared code, no enforcement
- Already diverging (different return types)
- **Fix:** Import from `@automd/shared` or add CI sync check.

### 17. System prompt omits key tools
**File:** `packages/mcp/src/prompts/system.ts:65-74`
- Missing: `get_related`, `link_tasks`, `get_working_context`, `create_project`, `rename_item`, `rename_column`, `delete_column`
- Agents won't discover relationship tools
- **Fix:** Update tool list.

### 18. Prompt workflows use flatMap without flattenApiTasks
**File:** `packages/mcp/src/prompts/workflows.ts:14-15, 48-49`
- Child task lookup returns undefined
- Prompt receives `"undefined"` as task data
- **Fix:** Use `flattenApiTasks()`.

## LOW

### 19. link_tasks: createdBy hardcoded to 'agent'
**File:** `packages/mcp/src/tools.ts:1090`
- Not attributed to specific agent
- **Fix:** Add agentName parameter.

### 20. label filter runs after scoring — wasted work
**File:** `packages/mcp/src/tools.ts:626-643`
- Should filter first (cheap), then score (expensive)

### 21. api-client: limit=0 is falsy — silently dropped
**File:** `packages/mcp/src/api-client.ts:146,217`
- `if (params.limit)` drops limit=0
- **Fix:** Check `!== undefined`.

### 22. Stop words include 'use'/'using' — breaks knowledge dedup
**File:** `packages/mcp/src/stop-words.ts:11`
- "Use connection pooling" vs "Avoid connection pooling" match as similar
