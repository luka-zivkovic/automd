# Audit: Editor, Import/Export & UI/UX

## CRITICAL

### 1. Double-write on import: setMarkdown + reparseFromMarkdown causes inconsistent state
**File:** `src/hooks/useFileImport.ts:15-17`
- Two separate Zustand updates → subscribers see inconsistent intermediate state
- Between updates: markdown is new file, tasks are old file
- **Fix:** Remove `setMarkdown` call; `reparseFromMarkdown` already sets markdown.

### 2. isEditorOrigin guard is fragile behavioral dependency on @uiw/react-codemirror
**File:** `src/components/editor/MarkdownEditor.tsx:31-35,43-57`
- Relies on CM not emitting onChange for programmatic dispatches
- Library version change could create infinite loop
- **Fix:** Track programmatic dispatches with secondary ref.

## HIGH

### 3. Undo/redo reads stale state via get() inside Immer set callback
**File:** `src/store/document-store.ts:289,311`
- `state._future = [...get()._future, ...]` reads committed state, not draft
- Rapid Ctrl+Z can lose undo entries
- **Fix:** Use `state._future` (draft) instead of `get()._future`.

### 4. File import has no size limit — multi-MB file will hang browser
**File:** `src/hooks/useFileImport.ts:12-18`
- No `file.size` check before reading
- **Fix:** Guard `if (file.size > 5 * 1024 * 1024) return`.

### 5. Theme system listener never removed — HMR memory leak
**File:** `src/store/theme-store.ts:38-42`
- `addEventListener('change', handler)` without cleanup
- **Fix:** Return cleanup function from `initTheme`.

### 6. useFileImport leaks detached DOM input element
**File:** `src/hooks/useFileImport.ts:9-19`
- `document.createElement('input')` never appended or removed
- **Fix:** Append to body, click, then remove.

### 7. useActiveFileSync debounce can write to wrong file on rapid switch
**File:** `src/hooks/useActiveFileSync.ts:76-80`
- 300ms timer closure captures stale activeFileId
- **Fix:** Verify fileId at timer fire time.

## MEDIUM

### 8. FileDropZone dragLeave flickers on child transitions
### 9. Export uses hardcoded filename 'tasks.md'
### 10. revokeObjectURL called before download starts
### 11. CommandPalette has no focus trap or aria-modal
### 12. mdast-renderer: links with javascript: scheme not blocked (XSS)
