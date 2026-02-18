import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../parser'
import { annotateIds, createIdCache } from '../id-annotator'
import { extractTasksAndColumns } from '../task-extractor'

/** Helper: parse, annotate IDs, and extract tasks/columns */
function extract(markdown: string) {
  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(markdown), cache)
  return extractTasksAndColumns(ast)
}

describe('extractTasksAndColumns', () => {
  it('should extract tasks from a single column', () => {
    const { tasks, columns } = extract('## Todo\n\n- [ ] Task 1\n- [x] Task 2\n')

    expect(columns).toHaveLength(1)
    expect(columns[0].title).toBe('Todo')
    expect(tasks).toHaveLength(2)
    expect(tasks[0].content).toBe('Task 1')
    expect(tasks[0].checked).toBe(false)
    expect(tasks[1].content).toBe('Task 2')
    expect(tasks[1].checked).toBe(true)
  })

  it('should extract tasks from multiple columns', () => {
    const md = '## Todo\n\n- [ ] Task A\n\n## Done\n\n- [x] Task B\n- [x] Task C\n'
    const { columns, tasks } = extract(md)

    expect(columns).toHaveLength(2)
    expect(columns[0].title).toBe('Todo')
    expect(columns[0].tasks).toHaveLength(1)
    expect(columns[1].title).toBe('Done')
    expect(columns[1].tasks).toHaveLength(2)
    expect(tasks).toHaveLength(3)
  })

  it('should associate tasks with correct column title', () => {
    const md = '## Backlog\n\n- [ ] Task 1\n\n## In Progress\n\n- [ ] Task 2\n'
    const { tasks } = extract(md)

    expect(tasks[0].column).toBe('Backlog')
    expect(tasks[1].column).toBe('In Progress')
  })

  it('should extract nested subtasks', () => {
    const md = '## Todo\n\n- [ ] Parent\n  - [ ] Child 1\n  - [ ] Child 2\n'
    const { tasks } = extract(md)

    expect(tasks).toHaveLength(1) // Only top-level in tasks array
    expect(tasks[0].content).toBe('Parent')
    expect(tasks[0].depth).toBe(0)
    expect(tasks[0].children).toHaveLength(2)
    expect(tasks[0].children[0].content).toBe('Child 1')
    expect(tasks[0].children[0].depth).toBe(1)
    expect(tasks[0].children[1].content).toBe('Child 2')
    expect(tasks[0].children[1].depth).toBe(1)
  })

  it('should extract deeply nested tasks (3 levels)', () => {
    const md = [
      '## Todo',
      '',
      '- [ ] Level 0',
      '  - [ ] Level 1',
      '    - [ ] Level 2',
      '',
    ].join('\n')
    const { tasks } = extract(md)

    expect(tasks[0].depth).toBe(0)
    expect(tasks[0].children[0].depth).toBe(1)
    expect(tasks[0].children[0].children[0].depth).toBe(2)
    expect(tasks[0].children[0].children[0].content).toBe('Level 2')
  })

  it('should assign unique IDs to all tasks', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n'
    const { tasks } = extract(md)

    const ids = tasks.map((t) => t.id)
    expect(new Set(ids).size).toBe(3)
    ids.forEach((id) => expect(id).toBeTruthy())
  })

  it('should assign unique IDs to columns', () => {
    const md = '## A\n\n- [ ] T1\n\n## B\n\n- [ ] T2\n\n## C\n\n- [ ] T3\n'
    const { columns } = extract(md)

    const ids = columns.map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
    ids.forEach((id) => expect(id).toBeTruthy())
  })

  it('should parse metadata from task content', () => {
    const md = '## Todo\n\n- [ ] Fix bug @alice #urgent priority:high\n'
    const { tasks } = extract(md)

    expect(tasks[0].metadata.assignees).toEqual(['alice'])
    expect(tasks[0].metadata.labels).toEqual(['urgent'])
    expect(tasks[0].metadata.priority).toBe('high')
    expect(tasks[0].displayContent).toBe('Fix bug')
  })

  it('should return empty metadata for tasks without tokens', () => {
    const md = '## Todo\n\n- [ ] Simple task\n'
    const { tasks } = extract(md)

    expect(tasks[0].metadata.assignees).toEqual([])
    expect(tasks[0].metadata.labels).toEqual([])
    expect(tasks[0].metadata.priority).toBeNull()
    expect(tasks[0].metadata.dueDate).toBeNull()
    expect(tasks[0].metadata.estimate).toBeNull()
  })

  it('should build taskMap with all tasks including children', () => {
    const md = '## Todo\n\n- [ ] Parent\n  - [ ] Child\n'
    const { taskMap, tasks } = extract(md)

    const parent = tasks[0]
    const child = tasks[0].children[0]

    expect(taskMap.get(parent.id)).toBe(parent)
    expect(taskMap.get(child.id)).toBe(child)
    expect(taskMap.size).toBe(2)
  })

  it('should handle empty columns (heading with no tasks)', () => {
    const md = '## Empty\n\n## Has Tasks\n\n- [ ] Task 1\n'
    const { columns } = extract(md)

    // Empty column is not included (flushColumn skips when currentTasks.length === 0)
    expect(columns).toHaveLength(1)
    expect(columns[0].title).toBe('Has Tasks')
  })

  it('should skip non-task list items (no checked property)', () => {
    const md = '## Todo\n\n- Regular item\n- [ ] Task item\n'
    const { tasks } = extract(md)

    // Only the checkbox item is treated as a task
    expect(tasks).toHaveLength(1)
    expect(tasks[0].content).toBe('Task item')
  })

  it('should set parentHeadingId to column ID', () => {
    const md = '## Todo\n\n- [ ] Task 1\n'
    const { tasks, columns } = extract(md)

    expect(tasks[0].parentHeadingId).toBe(columns[0].id)
  })
})

describe('ID stability', () => {
  it('should produce stable IDs across parses of the same document', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n'

    const cache = createIdCache()
    const ast1 = annotateIds(parseMarkdown(md), cache)
    const result1 = extractTasksAndColumns(ast1)

    // Parse again with the same cache
    const ast2 = annotateIds(parseMarkdown(md), cache)
    const result2 = extractTasksAndColumns(ast2)

    expect(result1.tasks[0].id).toBe(result2.tasks[0].id)
    expect(result1.tasks[1].id).toBe(result2.tasks[1].id)
    expect(result1.columns[0].id).toBe(result2.columns[0].id)
  })
})
