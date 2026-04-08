# Audit: Task Management

## CRITICAL

### 1. Column routes bypass write-lock and have no ID validation
**File:** `packages/server/src/routes/columns.ts:26-70`
- Rename and delete operations execute without `withWriteLock`
- Zero validation of `fileId` or `columnId` path parameters
- Two concurrent requests can interleave and silently resurrect deleted columns
- **Fix:** Wrap both handlers in `withWriteLock`. Add `isValidId` checks.

### 2. `storage.updateFileMarkdown` writes manifest BEFORE markdown — no rollback
**File:** `packages/server/src/storage.ts:239-264`
- Writes `updatedAt` to manifest first, then markdown file
- If file write fails (disk full), manifest is permanently inconsistent
- **Fix:** Write markdown first (to .tmp then rename), then update manifest.

### 3. Board cache never invalidated after task/column mutations
**File:** `packages/server/src/board-cache.ts` / `routes/tasks.ts` / `routes/columns.ts`
- `invalidateBoardCache` only called in `files.ts` (on markdown PUT)
- Task/column routers never call it
- Stale cache → fingerprint collisions → wrong IDs assigned to tasks
- **Fix:** Call `invalidateBoardCache(fileId)` inside `saveAndBroadcast`.

### 4. `toggleTask` silently swallows completedAt stamping failure
**File:** `packages/server/src/routes/tasks.ts:157-185`
- `completedAt` stamp wrapped in try/catch that logs warning and continues
- Returns 200 success but completedAt is missing
- Webhook fires `task.completed` even when metadata stamp failed
- **Fix:** Propagate error or move `webhookEvent` assignment inside try block.

## HIGH

### 5. `updateTaskDescription` in checkbox-tasks mode corrupts multi-paragraph content
**File:** `packages/shared/src/task-mutator.ts:483-499`
- Description removal logic is O(n²) and produces duplicate task titles
- Descriptions are write-once: saving twice removes content on second save
- **Fix:** Track title paragraph with a proper flag, not slice scan.

### 6. Drag-and-drop fires two `moveTask` calls — second operates on stale state
**File:** `src/components/kanban/KanbanBoard.tsx:94-155`
- `handleDragOver` + `handleDragEnd` both fire `moveTask`
- Second call computes index from already-mutated columns
- Tasks end up in wrong order after cross-column drag
- **Fix:** Detect task already moved by `handleDragOver`, skip re-calling or adjust offset.

### 7. `add_column` MCP tool bypasses AST infrastructure
**File:** `packages/mcp/src/tools.ts:317-325`
- Uses raw string concatenation instead of AST mutator
- Always injects H1 heading, breaking checkbox-tasks mode documents
- Title not sanitized — newlines produce malformed markdown
- **Fix:** Expose `addColumn` API endpoint or sanitize title + match heading depth.

### 8. `update_task_metadata` MCP tool misses subtasks
**File:** `packages/mcp/src/tools.ts:377-400`
- Only scans `column.tasks` (top-level), not `task.children`
- Returns 'Task not found' as plain text (not error), misleading agents
- **Fix:** Use `flattenApiTasks()` for task lookup.

### 9. No ETag sent on MCP metadata updates — TOCTOU race
**File:** `packages/mcp/src/tools.ts:376-401`
- Fetches full board then dispatches PATCH without If-Match
- Concurrent MCP agents silently lose updates
- **Fix:** Pass `updatedAt` as `If-Match`, handle 409 with retry.

### 10. Fingerprint-based IDs are positional — reordering changes all subsequent IDs
**File:** `packages/shared/src/id-annotator.ts:23-28`
- Fingerprint includes sequential index within scope
- Deleting first task shifts all remaining IDs
- **Fix:** Make fingerprint position-independent (content + scope only).

## MEDIUM

### 11. `detectHeadingStructure` called 3-4 times per mutation
**File:** `packages/shared/src/task-mutator.ts` (all exports)
- Full O(n) AST walk repeated per mutation call
- **Fix:** Compute once and pass as parameter.

### 12. DescriptionEditor debounce fires with stale taskId
**File:** `src/components/detail/DescriptionEditor.tsx:33-43`
- 500ms debounce captures taskId in closure
- Switching tasks within 500ms writes to wrong task
- **Fix:** Add taskId to cleanup effect dependency array.

### 13. deleteColumn silently succeeds on non-existent columns
**File:** `packages/server/src/routes/columns.ts:55-70`
- Returns 204 and writes identical markdown
- Bumps `updatedAt` and broadcasts spurious update
- **Fix:** Return 404 when column not found.

### 14. `updateTaskDescription` loses inline markdown on round-trip
**File:** `packages/shared/src/task-mutator.ts:461-474`
- Description lines reconstructed as plain text
- Bold, links, code spans destroyed on save
- **Fix:** Parse descriptions through remark before creating nodes.

### 15. `updateTaskContent` silently no-ops for headings with inline markup
**File:** `packages/shared/src/task-mutator.ts:388-393`
- Only mutates first `text` child — skips inline nodes
- **Fix:** Reconstruct heading children as single text node.

### 16. `bulk_update_tasks` makes sequential HTTP calls with no batching
**File:** `packages/mcp/src/tools.ts:463-497`
- 20-task update = 20 HTTP calls + 20 WebSocket broadcasts
- **Fix:** Expose server-side bulk endpoint or parallelize.

### 17. ColumnHeader double-save on click-outside-while-renaming
**File:** `src/components/kanban/ColumnHeader.tsx:34-67`
- Both onBlur and mousedown handler fire
- **Fix:** Unconditional listener cleanup.
