import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../parser'
import { serializeAst } from '../serializer'
import { annotateIds, createIdCache } from '../id-annotator'
import { extractTasksAndColumns } from '../task-extractor'
import { addColumn, renameColumn, deleteColumn, moveColumn } from '../task-mutator'

/** Helper: parse, annotate IDs, extract */
function prepareBoard(markdown: string) {
  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(markdown), cache)
  const extracted = extractTasksAndColumns(ast)
  return { ast, ...extracted }
}

/** Helper: apply mutation, re-parse, and extract */
function extractAfterMutation(mutatedAst: import('mdast').Root) {
  const cache = createIdCache()
  const annotated = annotateIds(parseMarkdown(serializeAst(mutatedAst)), cache)
  return extractTasksAndColumns(annotated)
}

describe('addColumn', () => {
  it('should add a new column at the end', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const added = addColumn(ast, 'In Progress')
    const serialized = serializeAst(added)

    expect(serialized).toContain('## In Progress')
    // Todo should still be there
    expect(serialized).toContain('## Todo')
  })

  it('should create column with empty task list', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const added = addColumn(ast, 'New Column')
    const result = extractAfterMutation(added)

    // The new empty column won't appear in columns (no tasks), but heading exists
    const serialized = serializeAst(added)
    expect(serialized).toContain('## New Column')
    // Existing tasks preserved
    expect(result.tasks).toHaveLength(1)
  })

  it('should not mutate the original AST', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const original = JSON.stringify(ast)
    addColumn(ast, 'New Column')
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('renameColumn', () => {
  it('should rename a column', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const renamed = renameColumn(ast, columns[0].id, 'Backlog')
    const result = extractAfterMutation(renamed)

    expect(result.columns[0].title).toBe('Backlog')
  })

  it('should preserve tasks in the renamed column', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n'
    const { ast, columns } = prepareBoard(md)

    const renamed = renameColumn(ast, columns[0].id, 'New Name')
    const result = extractAfterMutation(renamed)

    expect(result.columns[0].tasks).toHaveLength(2)
    expect(result.tasks[0].column).toBe('New Name')
  })

  it('should handle non-existent column ID gracefully', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const renamed = renameColumn(ast, 'nonexistent', 'New Name')
    const result = extractAfterMutation(renamed)
    expect(result.columns[0].title).toBe('Todo') // Unchanged
  })

  it('should not mutate the original AST', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const original = JSON.stringify(ast)
    renameColumn(ast, columns[0].id, 'New Name')
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('deleteColumn', () => {
  it('should delete a column and its tasks', () => {
    const md = '## Todo\n\n- [ ] Task 1\n\n## Done\n\n- [x] Task 2\n'
    const { ast, columns } = prepareBoard(md)

    const deleted = deleteColumn(ast, columns[0].id) // Delete Todo
    const result = extractAfterMutation(deleted)

    expect(result.columns).toHaveLength(1)
    expect(result.columns[0].title).toBe('Done')
    expect(result.tasks).toHaveLength(1)
  })

  it('should delete the last column', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const deleted = deleteColumn(ast, columns[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.columns).toHaveLength(0)
    expect(result.tasks).toHaveLength(0)
  })

  it('should handle non-existent column ID gracefully', () => {
    const md = '## Todo\n\n- [ ] Task 1\n'
    const { ast } = prepareBoard(md)
    const deleted = deleteColumn(ast, 'nonexistent')
    const result = extractAfterMutation(deleted)
    expect(result.columns).toHaveLength(1)
    expect(result.tasks).toHaveLength(1)
  })

  it('should not mutate the original AST', () => {
    const md = '## Todo\n\n- [ ] Task 1\n\n## Done\n\n- [x] Task 2\n'
    const { ast, columns } = prepareBoard(md)
    const original = JSON.stringify(ast)
    deleteColumn(ast, columns[0].id)
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('moveColumn', () => {
  it('should move column to a different position', () => {
    const md = '## A\n\n- [ ] T1\n\n## B\n\n- [ ] T2\n\n## C\n\n- [ ] T3\n'
    const { ast, columns } = prepareBoard(md)

    // Move C (index 2) to position 0
    const moved = moveColumn(ast, columns[2].id, 0)
    const result = extractAfterMutation(moved)

    expect(result.columns[0].title).toBe('C')
    expect(result.columns[1].title).toBe('A')
    expect(result.columns[2].title).toBe('B')
  })

  it('should preserve tasks when moving column', () => {
    const md = '## A\n\n- [ ] Task A1\n- [ ] Task A2\n\n## B\n\n- [ ] Task B1\n'
    const { ast, columns } = prepareBoard(md)

    const moved = moveColumn(ast, columns[0].id, 1)
    const result = extractAfterMutation(moved)

    // B should now be first
    expect(result.columns[0].title).toBe('B')
    expect(result.columns[0].tasks).toHaveLength(1)
    // A should be second with its 2 tasks
    expect(result.columns[1].title).toBe('A')
    expect(result.columns[1].tasks).toHaveLength(2)
  })

  it('should handle non-existent column ID gracefully', () => {
    const md = '## A\n\n- [ ] T1\n\n## B\n\n- [ ] T2\n'
    const { ast } = prepareBoard(md)
    const moved = moveColumn(ast, 'nonexistent', 0)
    const result = extractAfterMutation(moved)
    expect(result.columns[0].title).toBe('A')
    expect(result.columns[1].title).toBe('B')
  })

  it('should not mutate the original AST', () => {
    const md = '## A\n\n- [ ] T1\n\n## B\n\n- [ ] T2\n'
    const { ast, columns } = prepareBoard(md)
    const original = JSON.stringify(ast)
    moveColumn(ast, columns[0].id, 1)
    expect(JSON.stringify(ast)).toBe(original)
  })
})
