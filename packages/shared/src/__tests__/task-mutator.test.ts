import { describe, it, expect } from 'vitest'
import type { Heading } from 'mdast'
import { parseMarkdown } from '../parser'
import { serializeAst } from '../serializer'
import { annotateIds, createIdCache } from '../id-annotator'
import { extractTasksAndColumns } from '../task-extractor'
import {
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  updateTaskDescription,
  deleteTask,
} from '../task-mutator'
import { emptyMetadata } from '../metadata-parser'

/** Helper: parse, annotate IDs, extract — returns ast + extraction results + all heading IDs */
function prepareBoard(markdown: string) {
  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(markdown), cache)
  const extracted = extractTasksAndColumns(ast)
  // Collect all H2 heading IDs from the AST (including empty columns)
  const headingIds: string[] = []
  for (const child of ast.children) {
    if (child.type === 'heading' && (child as Heading).depth === 2) {
      const id = (child.data as Record<string, unknown>)?.automdId as string
      if (id) headingIds.push(id)
    }
  }
  return { ast, ...extracted, headingIds }
}

/** Helper: apply mutation to AST, then re-annotate and extract for verification */
function extractAfterMutation(mutatedAst: import('mdast').Root) {
  // Re-annotate after mutation so extractTasksAndColumns can find IDs
  const cache = createIdCache()
  const annotated = annotateIds(parseMarkdown(serializeAst(mutatedAst)), cache)
  return extractTasksAndColumns(annotated)
}

describe('toggleTask', () => {
  it('should toggle unchecked to checked', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const toggled = toggleTask(ast, tasks[0].id)
    const result = extractAfterMutation(toggled)
    expect(result.tasks[0].checked).toBe(true)
  })

  it('should toggle checked to unchecked', () => {
    const { ast, tasks } = prepareBoard('## Done\n\n- [x] Task 1\n')
    const toggled = toggleTask(ast, tasks[0].id)
    const result = extractAfterMutation(toggled)
    expect(result.tasks[0].checked).toBe(false)
  })

  it('should return cloned AST when task ID not found', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const result = toggleTask(ast, 'nonexistent-id')
    expect(result).not.toBe(ast) // Should be a clone
    const extracted = extractAfterMutation(result)
    expect(extracted.tasks[0].checked).toBe(false) // Unchanged
  })

  it('should not mutate the original AST', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const original = structuredClone(ast)
    toggleTask(ast, tasks[0].id)
    expect(JSON.stringify(ast)).toBe(JSON.stringify(original))
  })
})

describe('moveTask', () => {
  it('should move task from one column to another', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n\n## Done\n\n- [x] Task 3\n'
    const { ast, tasks, columns } = prepareBoard(md)

    const moved = moveTask(ast, tasks[0].id, columns[1].id, 0)
    const result = extractAfterMutation(moved)

    expect(result.columns[0].tasks).toHaveLength(1) // Todo: was 2, now 1
    expect(result.columns[1].tasks).toHaveLength(2) // Done: was 1, now 2
  })

  it('should insert at the specified index', () => {
    const md = '## Todo\n\n- [ ] Task 1\n\n## Done\n\n- [x] Task A\n- [x] Task B\n'
    const { ast, tasks, headingIds } = prepareBoard(md)

    // Move Task 1 to Done (headingIds[1]) at index 1 (between A and B)
    const moved = moveTask(ast, tasks[0].id, headingIds[1], 1)
    const result = extractAfterMutation(moved)
    // After move, Done column should have 3 tasks
    const doneCol = result.columns.find((c) => c.title === 'Done')!
    const doneTaskContents = doneCol.tasks.map((t) => t.content)

    expect(doneTaskContents[0]).toBe('Task A')
    expect(doneTaskContents[1]).toContain('Task 1')
    expect(doneTaskContents[2]).toBe('Task B')
  })

  it('should clamp index to list length', () => {
    const md = '## Todo\n\n- [ ] Task 1\n\n## Done\n\n- [x] Task A\n'
    const { ast, tasks, headingIds } = prepareBoard(md)

    // Move with index way beyond list length
    const moved = moveTask(ast, tasks[0].id, headingIds[1], 999)
    const result = extractAfterMutation(moved)

    const doneCol = result.columns.find((c) => c.title === 'Done')!
    expect(doneCol.tasks).toHaveLength(2)
  })

  it('should handle moving to column with no list (creates list)', () => {
    // Done column has no tasks → no list node
    const md = '## Todo\n\n- [ ] Task 1\n\n## Done\n'
    const { ast, tasks, headingIds } = prepareBoard(md)

    const moved = moveTask(ast, tasks[0].id, headingIds[1], 0)
    const serialized = serializeAst(moved)
    expect(serialized).toContain('## Done')
    expect(serialized).toContain('Task 1')
  })

  it('should not mutate the original AST', () => {
    const md = '## Todo\n\n- [ ] Task 1\n\n## Done\n\n- [x] Task 2\n'
    const { ast, tasks, columns } = prepareBoard(md)
    const original = JSON.stringify(ast)
    moveTask(ast, tasks[0].id, columns[1].id, 0)
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('addTask', () => {
  it('should add a task to a column', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const added = addTask(ast, columns[0].id, 'New task', 'new-id-123')
    const result = extractAfterMutation(added)

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[1].displayContent).toBe('New task')
  })

  it('should add task with metadata content', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const added = addTask(ast, columns[0].id, 'Fix bug @alice #urgent', 'id-456')
    const result = extractAfterMutation(added)

    expect(result.tasks[1].metadata.assignees).toEqual(['alice'])
    expect(result.tasks[1].metadata.labels).toEqual(['urgent'])
  })

  it('should add task to empty column (creates list)', () => {
    const md = '## Todo\n\n## Empty\n'
    const { ast, columns } = prepareBoard(md)

    // "Empty" column has no tasks so it won't appear in columns
    // but we can use its heading ID by looking at AST directly
    const cache = createIdCache()
    const annotated = annotateIds(parseMarkdown(md), cache)
    // Find the second heading's ID
    const headings = annotated.children.filter(
      (c) => c.type === 'heading' && (c as any).depth === 2
    )
    const emptyHeadingId = (headings[1]?.data as any)?.automdId

    if (emptyHeadingId) {
      const added = addTask(annotated, emptyHeadingId, 'First task', 'new-id')
      const serialized = serializeAst(added)
      expect(serialized).toContain('First task')
    }
  })

  it('should not mutate the original AST', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const original = JSON.stringify(ast)
    addTask(ast, columns[0].id, 'New task', 'id-789')
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('updateTaskContent', () => {
  it('should replace task text content', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Old content\n')

    const updated = updateTaskContent(ast, tasks[0].id, 'New content')
    const serialized = serializeAst(updated)

    expect(serialized).toContain('New content')
    expect(serialized).not.toContain('Old content')
  })

  it('should preserve checked state', () => {
    const { ast, tasks } = prepareBoard('## Done\n\n- [x] Original\n')

    const updated = updateTaskContent(ast, tasks[0].id, 'Updated')
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].checked).toBe(true)
  })

  it('should handle non-existent task ID gracefully', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const updated = updateTaskContent(ast, 'nonexistent', 'New content')
    const result = extractAfterMutation(updated)
    expect(result.tasks[0].content).toBe('Task 1')
  })
})

describe('updateTaskMetadata', () => {
  it('should serialize and update metadata tokens', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Task\n')

    const metadata = { ...emptyMetadata(), assignees: ['bob'], priority: 'high' as const }
    const updated = updateTaskMetadata(ast, tasks[0].id, 'Task', metadata)
    const serialized = serializeAst(updated)

    expect(serialized).toContain('@bob')
    expect(serialized).toContain('priority:high')
  })

  it('should replace existing metadata', () => {
    const { ast, tasks } = prepareBoard(
      '## Todo\n\n- [ ] Task @alice priority:low\n'
    )

    const metadata = { ...emptyMetadata(), assignees: ['bob'], priority: 'high' as const }
    const updated = updateTaskMetadata(ast, tasks[0].id, 'Task', metadata)
    const serialized = serializeAst(updated)

    expect(serialized).toContain('@bob')
    expect(serialized).toContain('priority:high')
    expect(serialized).not.toContain('@alice')
    expect(serialized).not.toContain('priority:low')
  })
})

describe('updateTaskDescription', () => {
  it('should add description to task without one', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Task\n')

    const updated = updateTaskDescription(ast, tasks[0].id, 'Some details')
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].description).toBe('Some details')
  })

  it('should replace existing description', () => {
    // Tasks with descriptions have additional paragraphs in the list item
    const md = '## Todo\n\n- [ ] Task\n\n  Old description\n'
    const { ast, tasks } = prepareBoard(md)

    const updated = updateTaskDescription(ast, tasks[0].id, 'New description')
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].description).toBe('New description')
  })

  it('should remove description when null is passed', () => {
    const md = '## Todo\n\n- [ ] Task\n\n  Has description\n'
    const { ast, tasks } = prepareBoard(md)

    const updated = updateTaskDescription(ast, tasks[0].id, null)
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].description).toBeNull()
  })

  it('should handle multiline description', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Task\n')

    const updated = updateTaskDescription(ast, tasks[0].id, 'Line 1\nLine 2')
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].description).toBe('Line 1\nLine 2')
  })
})

describe('deleteTask', () => {
  it('should remove a task', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteTask(ast, tasks[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].displayContent).toBe('Task 2')
  })

  it('should clean up empty list when deleting last task', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Only task\n')

    const deleted = deleteTask(ast, tasks[0].id)
    const serialized = serializeAst(deleted)

    // The empty list should be removed
    expect(serialized.trim()).toBe('## Todo')
  })

  it('should not affect other columns', () => {
    const md = '## Todo\n\n- [ ] Task A\n\n## Done\n\n- [x] Task B\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteTask(ast, tasks[0].id) // Delete Task A from Todo
    const result = extractAfterMutation(deleted)

    expect(result.columns).toHaveLength(1) // Only Done has tasks now
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].displayContent).toBe('Task B')
  })

  it('should handle non-existent task ID gracefully', () => {
    const { ast } = prepareBoard('## Todo\n\n- [ ] Task 1\n')
    const deleted = deleteTask(ast, 'nonexistent')
    const result = extractAfterMutation(deleted)
    expect(result.tasks).toHaveLength(1)
  })

  it('should not mutate the original AST', () => {
    const { ast, tasks } = prepareBoard('## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n')
    const original = JSON.stringify(ast)
    deleteTask(ast, tasks[0].id)
    expect(JSON.stringify(ast)).toBe(original)
  })
})
