# Audit: Core Views & Projects

## CRITICAL

### 1. DragOver commits real moveTask on every pointer move — thrashes AST + breaks undo
**File:** `src/components/kanban/KanbanBoard.tsx:94-119`
- `handleDragOver` calls `moveTask()` (full markdown round-trip) on every DragOverEvent
- Pushes history entry for every intermediate hover → dozens of undo steps after one drag
- **Fix:** Use ephemeral local state for drag preview, commit only in `handleDragEnd`.

### 2. setTimeout(50ms) race for task selection from Dashboard
**File:** `src/components/dashboard/DashboardView.tsx:191`
- Assumes file parse completes within 50ms — fails silently on slow machines
- **Fix:** Subscribe to taskMap changes, show panel when task is available.

### 3. Stale closure in MarkdownEditor debounced reparse
**File:** `src/components/editor/MarkdownEditor.tsx:23-38`
- `debouncedReparse` created once, captures function refs at mount time
- Fragile if Zustand middleware changes action references
- **Fix:** Pass callback at call time rather than capturing in factory.

## HIGH

### 4. BoardCard.handleClick hardcodes `setActiveView('checklist')` for all item types
**File:** `src/components/dashboard/DashboardView.tsx:128-132`
- Board-type files open in checklist instead of kanban
- Page-type files open in checklist instead of editor
- **Fix:** Map itemType to appropriate view.

### 5. MemoryView navigates to 'editor' instead of item's natural view
**File:** `src/components/memory/MemoryView.tsx:135-141`
- Knowledge entries should open knowledge view, tasks should open kanban
- **Fix:** Read itemType and dispatch appropriate view.

### 6. MarkdownEditor debounce never cancelled on unmount
**File:** `src/components/editor/MarkdownEditor.tsx:23-27`
- Pending 300ms timer fires after unmount
- Can corrupt store if user switched files
- **Fix:** Add `useEffect(() => () => debouncedReparse.current.cancel(), [])`.

### 7. Sidebar drag-and-drop reorder uses stale `files` after moveFileToProject
**File:** `src/components/sidebar/Sidebar.tsx:182-226`
- Closure captures old `files` before store update
- Can cause duplicate IDs in reorder
- **Fix:** Use `useFilesStore.getState().files` for reorder calculation.

### 8. Project context menu clips inside ScrollArea
**File:** `src/components/sidebar/ProjectSection.tsx:209-212`
- `mt-16` absolute offset clips when near bottom of sidebar
- **Fix:** Render via portal or use Radix DropdownMenu.

## MEDIUM

### 9. EmbeddingsSettings shows infinite spinner when no server
### 10. Optimistic tag update race in ProjectSection
### 11. Dashboard onboarding hidden when only knowledge files exist
