# Audit: Task Metadata

## CRITICAL

### 1. No validation on `metadata` object from API — blind spread into mutations
**File:** `packages/server/src/routes/tasks.ts:204`
- `metadata` from `req.body` cast directly as `TaskMetadata` with no structural validation
- Invalid priority values, garbage dates, wrong types all accepted
- **Fix:** Validate with Zod schema at route level.

### 2. `beforeTasks.find()` and `parsedTasks.find()` miss subtasks
**File:** `packages/server/src/routes/tasks.ts:151,162`
- Only searches top-level tasks, subtasks in `task.children` missed
- `completedAt` never stamped for subtasks
- Webhook `column` field always empty for subtask actions
- **Fix:** Use recursive task map that includes subtasks.

### 3. Stateful regex `.test()` — dormant bug waiting to activate
**File:** `packages/shared/src/metadata-parser.ts:69,76`
- `ARCHIVED_RE` and `KNOWLEDGE_RE` use `.test()` without `g` flag — safe now
- Adding `g` flag (easy mistake) makes `.test()` alternate true/false
- Other regexes in same file already use `g` flag
- **Fix:** Use `.match() !== null` instead of `.test()`.

## HIGH

### 4. `@mention` and `#label` regex match inside words — false positives
**File:** `packages/shared/src/metadata-parser.ts:3,4`
- `"Fix email@domain.com"` extracts assignee `domain`
- `"Use color #FF0000"` extracts label `FF0000`
- `"Closes #123"` extracts label `123`
- Display content corrupted by stripping these false positives
- **Fix:** Require preceding whitespace: `/(?:^|\s)@(\w[\w-]*)/g`

### 5. Due dates accept semantically invalid values
**File:** `packages/shared/src/metadata-parser.ts:5`
- `due:2024-99-99` passes regex, stored verbatim
- No `Date.parse()` or range check
- **Fix:** Validate with `!isNaN(new Date(dateStr).getTime())`.

### 6. Estimates unbounded — `est:999999h` accepted
**File:** `packages/shared/src/metadata-parser.ts:6`
- `est:1.2.3` silently becomes `1.2` via parseFloat
- No upper bound, no leading-digit requirement
- **Fix:** Validate finite + reasonable range.

### 7. `completedAt` never clearable via MCP — leaky abstraction
**File:** `packages/shared/src/metadata-serializer.ts:37-39`
- Auto-set by toggle, persists after un-archiving
- MCP `update_task_metadata` has no `completedAt` field
- Only clearable by manually stripping token via `update_task`
- **Fix:** Expose `completedAt` as nullable field in MCP tool.

### 8. `updateTaskDescription` removes ALL paragraphs, destroys ordering
**File:** `packages/shared/src/task-mutator.ts:449-458`
- Strips every paragraph in task block unconditionally
- Re-insertion always before blockquotes — reorders document structure
- **Fix:** Only remove paragraphs before first blockquote/list.

## MEDIUM

### 9. Duplicate metadata tokens — no deduplication
**File:** `packages/shared/src/metadata-parser.ts:50,54`
- `@alice @alice` produces `assignees: ['alice', 'alice']`
- Persists through round-trip
- **Fix:** Deduplicate arrays after extraction.

### 10. Task content length not validated at API level
**File:** `packages/server/src/routes/tasks.ts:76-78`
- Only presence checked, not length
- 5MB task title accepted
- **Fix:** Add `content.length <= 2000` guard.

### 11. `acceptanceCriteria` and `learnings` not type-checked
**File:** `packages/server/src/routes/tasks.ts:136,208,211`
- Could be number, array, object from malformed JSON
- Throws `TypeError` caught by outer catch, leaking server error
- **Fix:** Add type guard or Zod validation.

### 12. MCP `add_knowledge` labels not regex-validated
**File:** `packages/mcp/src/tools.ts:784`
- Labels typed as `z.array(z.string())` only
- Label like `priority:high` produces malformed token
- **Fix:** Validate each label with `/^\w[\w-]*$/`.

### 13. Learnings #tags not parsed into metadata labels
**File:** `packages/shared/src/task-extractor.ts:237-241`
- `#tags` in learnings only findable via text search bypass
- `search_tasks` label filter won't find them
- **Fix:** Document or add secondary extraction.

### 14. `toggleTask` adds permanent checkbox to non-checkbox tasks
**File:** `packages/shared/src/task-mutator.ts:197-205`
- First toggle adds `[x]` prefix permanently
- No way to return to "no checkbox" state
- **Fix:** Document as intentional or add removal path.

## LOW

### 15. `completedAt` uses UTC date — timezone ambiguity
**File:** `packages/shared/src/metadata-parser.ts:5,11`
- Server at UTC-5, task completed at 11pm local → stored as "tomorrow"

### 16. Serializer produces double spaces with trailing whitespace in displayContent
**File:** `packages/shared/src/metadata-serializer.ts:50`

### 17. No test coverage for edge cases
- False positive label extraction from color codes
- Invalid priority values
- Duplicate metadata tokens
- Invalid date formats
