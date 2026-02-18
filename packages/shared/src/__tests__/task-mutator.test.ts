import { describe, it, expect } from 'vitest'
import type { Heading } from 'mdast'
import { parseMarkdown } from '../parser'
import { serializeAst } from '../serializer'
import { annotateIds, createIdCache } from '../id-annotator'
import { extractTasksAndColumns, detectHeadingStructure } from '../task-extractor'
import {
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  updateTaskDescription,
  deleteTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from '../task-mutator'
import { emptyMetadata } from '../metadata-parser'

/** Helper: parse, annotate IDs, extract */
function prepareBoard(markdown: string) {
  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(markdown), cache)
  const extracted = extractTasksAndColumns(ast)
  const structure = detectHeadingStructure(ast)

  // Collect column heading IDs
  const headingIds: string[] = []
  for (const child of ast.children) {
    if (child.type === 'heading' && (child as Heading).depth === structure.columnDepth) {
      const id = (child.data as Record<string, unknown>)?.automdId as string
      if (id) headingIds.push(id)
    }
  }
  return { ast, ...extracted, headingIds }
}

/** Helper: apply mutation, re-parse, and extract */
function extractAfterMutation(mutatedAst: import('mdast').Root) {
  const cache = createIdCache()
  const annotated = annotateIds(parseMarkdown(serializeAst(mutatedAst)), cache)
  return extractTasksAndColumns(annotated)
}

// ─── Heading-Tasks Mode (H1 columns, H2 tasks) ──────────────────────

describe('heading-tasks: toggleTask', () => {
  it('should toggle task with checkbox prefix', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## [ ] Task 1\n')
    const toggled = toggleTask(ast, tasks[0].id)
    const result = extractAfterMutation(toggled)
    expect(result.tasks[0].checked).toBe(true)
  })

  it('should toggle checked task to unchecked', () => {
    const { ast, tasks } = prepareBoard('# Done\n\n## [x] Task 1\n')
    const toggled = toggleTask(ast, tasks[0].id)
    const result = extractAfterMutation(toggled)
    expect(result.tasks[0].checked).toBe(false)
  })

  it('should add checkbox prefix to plain task', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## Plain task\n')
    const toggled = toggleTask(ast, tasks[0].id)
    const result = extractAfterMutation(toggled)
    expect(result.tasks[0].checked).toBe(true)
  })

  it('should toggle subtask checkbox', () => {
    const { ast, tasks } = prepareBoard(
      '# Todo\n\n## Task\n\n- [ ] Subtask 1\n'
    )
    const subtask = tasks[0].children[0]
    const toggled = toggleTask(ast, subtask.id)
    const result = extractAfterMutation(toggled)
    expect(result.tasks[0].children[0].checked).toBe(true)
  })
})

describe('heading-tasks: moveTask', () => {
  it('should move task between columns', () => {
    const md = '# Todo\n\n## Task 1\n\n## Task 2\n\n# Done\n\n## Task 3\n'
    const { ast, tasks, columns } = prepareBoard(md)

    const moved = moveTask(ast, tasks[0].id, columns[1].id, 0)
    const result = extractAfterMutation(moved)

    expect(result.columns[0].tasks).toHaveLength(1) // Todo: was 2, now 1
    expect(result.columns[1].tasks).toHaveLength(2) // Done: was 1, now 2
  })

  it('should not mutate the original AST', () => {
    const md = '# Todo\n\n## Task 1\n\n# Done\n\n## Task 2\n'
    const { ast, tasks, columns } = prepareBoard(md)
    const original = JSON.stringify(ast)
    moveTask(ast, tasks[0].id, columns[1].id, 0)
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('heading-tasks: addTask', () => {
  it('should add a task to a column', () => {
    const { ast, columns } = prepareBoard('# Todo\n\n## Task 1\n')

    const added = addTask(ast, columns[0].id, 'New task', 'new-id-123')
    const result = extractAfterMutation(added)

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[1].displayContent).toBe('New task')
  })

  it('should add task with metadata', () => {
    const { ast, columns } = prepareBoard('# Todo\n\n## Task 1\n')

    const added = addTask(
      ast,
      columns[0].id,
      'Fix bug @alice #urgent',
      'id-456'
    )
    const result = extractAfterMutation(added)

    expect(result.tasks[1].metadata.assignees).toEqual(['alice'])
    expect(result.tasks[1].metadata.labels).toEqual(['urgent'])
  })

  it('should add task to empty column', () => {
    const md = '# Todo\n\n# Empty\n'
    const { ast, columns } = prepareBoard(md)

    const added = addTask(ast, columns[1].id, 'First task', 'new-id')
    const result = extractAfterMutation(added)

    const emptyCol = result.columns.find((c) => c.title === 'Empty')
    expect(emptyCol!.tasks).toHaveLength(1)
  })

  it('should create H2 heading for new task', () => {
    const { ast, columns } = prepareBoard('# Todo\n\n## Existing task\n')

    const added = addTask(ast, columns[0].id, 'My task', 'new-id')
    const serialized = serializeAst(added)

    expect(serialized).toContain('## My task')
  })

  it('should not mutate the original AST', () => {
    const { ast, columns } = prepareBoard('# Todo\n\n## Task 1\n')
    const original = JSON.stringify(ast)
    addTask(ast, columns[0].id, 'New task', 'id-789')
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('heading-tasks: updateTaskContent', () => {
  it('should replace task heading text', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## Old content\n')

    const updated = updateTaskContent(ast, tasks[0].id, 'New content')
    const serialized = serializeAst(updated)

    expect(serialized).toContain('New content')
    expect(serialized).not.toContain('Old content')
  })

  it('should preserve checkbox prefix when updating', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## [x] Original\n')

    const updated = updateTaskContent(ast, tasks[0].id, 'Updated')
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].checked).toBe(true)
    expect(result.tasks[0].content).toBe('Updated')
  })
})

describe('heading-tasks: updateTaskMetadata', () => {
  it('should serialize and update metadata tokens', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## Task\n')

    const metadata = {
      ...emptyMetadata(),
      assignees: ['bob'],
      priority: 'high' as const,
    }
    const updated = updateTaskMetadata(ast, tasks[0].id, 'Task', metadata)
    const serialized = serializeAst(updated)

    expect(serialized).toContain('@bob')
    expect(serialized).toContain('priority:high')
  })
})

describe('heading-tasks: updateTaskDescription', () => {
  it('should add description after H2 heading', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## Task\n')

    const updated = updateTaskDescription(ast, tasks[0].id, 'Some details')
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].description).toBe('Some details')
  })

  it('should remove description when null is passed', () => {
    const md = '# Todo\n\n## Task\n\nHas description\n'
    const { ast, tasks } = prepareBoard(md)

    const updated = updateTaskDescription(ast, tasks[0].id, null)
    const result = extractAfterMutation(updated)

    expect(result.tasks[0].description).toBeNull()
  })
})

describe('heading-tasks: deleteTask', () => {
  it('should remove a task and its content block', () => {
    const md = '# Todo\n\n## Task 1\n\n## Task 2\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteTask(ast, tasks[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].content).toBe('Task 2')
  })

  it('should remove task with subtasks', () => {
    const md = '# Todo\n\n## Task\n\n- [ ] Sub 1\n- [ ] Sub 2\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteTask(ast, tasks[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.tasks).toHaveLength(0)
  })

  it('should delete subtask', () => {
    const md = '# Todo\n\n## Task\n\n- [ ] Sub 1\n- [ ] Sub 2\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteTask(ast, tasks[0].children[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.tasks[0].children).toHaveLength(1)
    expect(result.tasks[0].children[0].content).toBe('Sub 2')
  })

  it('should not mutate the original AST', () => {
    const md = '# Todo\n\n## Task 1\n\n## Task 2\n'
    const { ast, tasks } = prepareBoard(md)
    const original = JSON.stringify(ast)
    deleteTask(ast, tasks[0].id)
    expect(JSON.stringify(ast)).toBe(original)
  })
})

describe('heading-tasks: subtask mutations', () => {
  it('should add subtask to a task', () => {
    const { ast, tasks } = prepareBoard('# Todo\n\n## Task\n')

    const added = addSubtask(ast, tasks[0].id, 'New subtask', 'sub-id')
    const result = extractAfterMutation(added)

    expect(result.tasks[0].children).toHaveLength(1)
    expect(result.tasks[0].children[0].content).toBe('New subtask')
    expect(result.tasks[0].children[0].checked).toBe(false)
  })

  it('should add subtask to task with existing subtasks', () => {
    const md = '# Todo\n\n## Task\n\n- [ ] Existing\n'
    const { ast, tasks } = prepareBoard(md)

    const added = addSubtask(ast, tasks[0].id, 'Another', 'sub-id-2')
    const result = extractAfterMutation(added)

    expect(result.tasks[0].children).toHaveLength(2)
  })

  it('should toggle subtask', () => {
    const md = '# Todo\n\n## Task\n\n- [ ] Subtask\n'
    const { ast, tasks } = prepareBoard(md)

    const toggled = toggleSubtask(ast, tasks[0].children[0].id)
    const result = extractAfterMutation(toggled)

    expect(result.tasks[0].children[0].checked).toBe(true)
  })

  it('should delete subtask', () => {
    const md = '# Todo\n\n## Task\n\n- [ ] Sub 1\n- [ ] Sub 2\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteSubtask(ast, tasks[0].children[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.tasks[0].children).toHaveLength(1)
    expect(result.tasks[0].children[0].content).toBe('Sub 2')
  })
})

// ─── Checkbox-Tasks Mode (Legacy) ────────────────────────────────────

describe('checkbox-tasks: toggleTask', () => {
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
})

describe('checkbox-tasks: moveTask', () => {
  it('should move task from one column to another', () => {
    const md =
      '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n\n## Done\n\n- [x] Task 3\n'
    const { ast, tasks, columns } = prepareBoard(md)

    const moved = moveTask(ast, tasks[0].id, columns[1].id, 0)
    const result = extractAfterMutation(moved)

    expect(result.columns[0].tasks).toHaveLength(1)
    expect(result.columns[1].tasks).toHaveLength(2)
  })
})

describe('checkbox-tasks: addTask', () => {
  it('should add a task to a column', () => {
    const { ast, columns } = prepareBoard('## Todo\n\n- [ ] Task 1\n')

    const added = addTask(ast, columns[0].id, 'New task', 'new-id-123')
    const result = extractAfterMutation(added)

    expect(result.tasks).toHaveLength(2)
    expect(result.tasks[1].displayContent).toBe('New task')
  })
})

describe('checkbox-tasks: deleteTask', () => {
  it('should remove a task', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n'
    const { ast, tasks } = prepareBoard(md)

    const deleted = deleteTask(ast, tasks[0].id)
    const result = extractAfterMutation(deleted)

    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].displayContent).toBe('Task 2')
  })
})
