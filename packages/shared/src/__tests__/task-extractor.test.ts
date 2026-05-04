import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../parser'
import { annotateIds, createIdCache } from '../id-annotator'
import {
  extractTasksAndColumns,
  detectHeadingStructure,
} from '../task-extractor'

/** Helper: parse, annotate IDs, and extract tasks/columns */
function extract(markdown: string) {
  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(markdown), cache)
  return extractTasksAndColumns(ast)
}

// ─── Heading-Tasks Mode (H1 columns, H2 tasks) ──────────────────────

describe('heading-tasks mode: detectHeadingStructure', () => {
  it('should detect H1+H2 as heading-tasks mode', () => {
    const ast = parseMarkdown('# Col\n\n## Task\n')
    const s = detectHeadingStructure(ast)
    expect(s.mode).toBe('heading-tasks')
    expect(s.columnDepth).toBe(1)
    expect(s.taskDepth).toBe(2)
  })

  it('should detect H2-only as checkbox-tasks mode', () => {
    const ast = parseMarkdown('## Col\n\n- [ ] Task\n')
    const s = detectHeadingStructure(ast)
    expect(s.mode).toBe('checkbox-tasks')
    expect(s.columnDepth).toBe(2)
    expect(s.taskDepth).toBeNull()
  })

  it('should detect H1-only as checkbox-tasks with columnDepth=1', () => {
    const ast = parseMarkdown('# Col\n\n- [ ] Task\n')
    const s = detectHeadingStructure(ast)
    expect(s.mode).toBe('checkbox-tasks')
    expect(s.columnDepth).toBe(1)
  })
})

describe('heading-tasks mode: extractTasksAndColumns', () => {
  it('should extract H1 as columns and H2 as tasks', () => {
    const md = '# Todo\n\n## Task 1\n\n## Task 2\n'
    const { columns, tasks } = extract(md)

    expect(columns).toHaveLength(1)
    expect(columns[0].title).toBe('Todo')
    expect(tasks).toHaveLength(2)
    expect(tasks[0].content).toBe('Task 1')
    expect(tasks[1].content).toBe('Task 2')
  })

  it('should extract tasks from multiple columns', () => {
    const md =
      '# Todo\n\n## Task A\n\n# Done\n\n## Task B\n\n## Task C\n'
    const { columns, tasks } = extract(md)

    expect(columns).toHaveLength(2)
    expect(columns[0].title).toBe('Todo')
    expect(columns[0].tasks).toHaveLength(1)
    expect(columns[1].title).toBe('Done')
    expect(columns[1].tasks).toHaveLength(2)
    expect(tasks).toHaveLength(3)
  })

  it('should associate tasks with correct column', () => {
    const md = '# Backlog\n\n## Task 1\n\n# In Progress\n\n## Task 2\n'
    const { tasks } = extract(md)

    expect(tasks[0].column).toBe('Backlog')
    expect(tasks[1].column).toBe('In Progress')
  })

  it('should parse optional checkbox prefix from H2', () => {
    const md =
      '# Todo\n\n## [ ] Unchecked task\n\n## [x] Checked task\n\n## Plain task\n'
    const { tasks } = extract(md)

    expect(tasks[0].checked).toBe(false)
    expect(tasks[0].content).toBe('Unchecked task')
    expect(tasks[1].checked).toBe(true)
    expect(tasks[1].content).toBe('Checked task')
    expect(tasks[2].checked).toBeNull()
    expect(tasks[2].content).toBe('Plain task')
  })

  it('should extract subtasks from checkbox lists under H2', () => {
    const md =
      '# Todo\n\n## Parent task\n\n- [ ] Subtask 1\n- [x] Subtask 2\n'
    const { tasks } = extract(md)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].content).toBe('Parent task')
    expect(tasks[0].children).toHaveLength(2)
    expect(tasks[0].children[0].content).toBe('Subtask 1')
    expect(tasks[0].children[0].checked).toBe(false)
    expect(tasks[0].children[1].content).toBe('Subtask 2')
    expect(tasks[0].children[1].checked).toBe(true)
  })

  it('should extract description from paragraphs after H2', () => {
    const md =
      '# Todo\n\n## My task\n\nThis is a description\n'
    const { tasks } = extract(md)

    expect(tasks[0].content).toBe('My task')
    expect(tasks[0].description).toContain('This is a description')
  })

  it('should preserve inline markdown in descriptions', () => {
    const md =
      '# Todo\n\n## My task\n\nUse **bold**, `code`, and [docs](https://example.com).\n'
    const { tasks } = extract(md)

    expect(tasks[0].description).toBe('Use **bold**, `code`, and [docs](https://example.com).')
  })

  it('should extract description and subtasks together', () => {
    const md = [
      '# Todo',
      '',
      '## My task',
      '',
      'Some description here',
      '',
      '- [ ] Subtask A',
      '- [ ] Subtask B',
      '',
    ].join('\n')
    const { tasks } = extract(md)

    expect(tasks[0].content).toBe('My task')
    expect(tasks[0].description).toBe('Some description here')
    expect(tasks[0].children).toHaveLength(2)
  })

  it('should parse metadata from H2 task headings', () => {
    const md = '# Todo\n\n## Fix bug @alice #urgent priority:high\n'
    const { tasks } = extract(md)

    expect(tasks[0].metadata.assignees).toEqual(['alice'])
    expect(tasks[0].metadata.labels).toEqual(['urgent'])
    expect(tasks[0].metadata.priority).toBe('high')
    expect(tasks[0].displayContent).toBe('Fix bug')
  })

  it('should preserve empty columns', () => {
    const md = '# Empty\n\n# Has Tasks\n\n## Task 1\n'
    const { columns } = extract(md)

    expect(columns).toHaveLength(2)
    expect(columns[0].title).toBe('Empty')
    expect(columns[0].tasks).toHaveLength(0)
    expect(columns[1].title).toBe('Has Tasks')
    expect(columns[1].tasks).toHaveLength(1)
  })

  it('should assign unique IDs to columns and tasks', () => {
    const md = '# A\n\n## T1\n\n# B\n\n## T2\n\n## T3\n'
    const { columns, tasks } = extract(md)

    const colIds = columns.map((c) => c.id)
    expect(new Set(colIds).size).toBe(2)
    colIds.forEach((id) => expect(id).toBeTruthy())

    const taskIds = tasks.map((t) => t.id)
    expect(new Set(taskIds).size).toBe(3)
    taskIds.forEach((id) => expect(id).toBeTruthy())
  })

  it('should build taskMap with all tasks including subtasks', () => {
    const md = '# Todo\n\n## Parent\n\n- [ ] Child\n'
    const { taskMap, tasks } = extract(md)

    const parent = tasks[0]
    const child = tasks[0].children[0]

    expect(taskMap.get(parent.id)).toBe(parent)
    expect(taskMap.get(child.id)).toBe(child)
    expect(taskMap.size).toBe(2)
  })

  it('should set parentHeadingId to column ID', () => {
    const md = '# Todo\n\n## Task 1\n'
    const { tasks, columns } = extract(md)

    expect(tasks[0].parentHeadingId).toBe(columns[0].id)
  })

  it('should set task depth to 0 for H2 tasks', () => {
    const md = '# Todo\n\n## Task 1\n'
    const { tasks } = extract(md)

    expect(tasks[0].depth).toBe(0)
  })
})

describe('heading-tasks mode: ID stability', () => {
  it('should produce stable IDs across parses', () => {
    const md = '# Todo\n\n## Task 1\n\n## Task 2\n'

    const cache = createIdCache()
    const ast1 = annotateIds(parseMarkdown(md), cache)
    const result1 = extractTasksAndColumns(ast1)

    const ast2 = annotateIds(parseMarkdown(md), cache)
    const result2 = extractTasksAndColumns(ast2)

    expect(result1.tasks[0].id).toBe(result2.tasks[0].id)
    expect(result1.tasks[1].id).toBe(result2.tasks[1].id)
    expect(result1.columns[0].id).toBe(result2.columns[0].id)
  })
})

// ─── Checkbox-Tasks Mode (Legacy: H2 columns, checkboxes) ───────────

describe('checkbox-tasks mode: extractTasksAndColumns', () => {
  it('should extract tasks from a single column', () => {
    const { tasks, columns } = extract(
      '## Todo\n\n- [ ] Task 1\n- [x] Task 2\n'
    )

    expect(columns).toHaveLength(1)
    expect(columns[0].title).toBe('Todo')
    expect(tasks).toHaveLength(2)
    expect(tasks[0].content).toBe('Task 1')
    expect(tasks[0].checked).toBe(false)
    expect(tasks[1].content).toBe('Task 2')
    expect(tasks[1].checked).toBe(true)
  })

  it('should extract tasks from multiple columns', () => {
    const md =
      '## Todo\n\n- [ ] Task A\n\n## Done\n\n- [x] Task B\n- [x] Task C\n'
    const { columns, tasks } = extract(md)

    expect(columns).toHaveLength(2)
    expect(columns[0].title).toBe('Todo')
    expect(columns[0].tasks).toHaveLength(1)
    expect(columns[1].title).toBe('Done')
    expect(columns[1].tasks).toHaveLength(2)
    expect(tasks).toHaveLength(3)
  })

  it('should extract nested subtasks', () => {
    const md = '## Todo\n\n- [ ] Parent\n  - [ ] Child 1\n  - [ ] Child 2\n'
    const { tasks } = extract(md)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].content).toBe('Parent')
    expect(tasks[0].children).toHaveLength(2)
    expect(tasks[0].children[0].content).toBe('Child 1')
  })

  it('should preserve empty columns', () => {
    const md = '## Empty\n\n## Has Tasks\n\n- [ ] Task 1\n'
    const { columns } = extract(md)

    expect(columns).toHaveLength(2)
    expect(columns[0].title).toBe('Empty')
    expect(columns[0].tasks).toHaveLength(0)
  })

  it('should create uncategorized column for tasks before headings', () => {
    const md = '- [ ] Orphan task\n\n## Todo\n\n- [ ] Task 1\n'
    const { columns } = extract(md)

    expect(columns).toHaveLength(2)
    expect(columns[0].title).toBe('Tasks')
    expect(columns[0].tasks[0].content).toBe('Orphan task')
    expect(columns[1].title).toBe('Todo')
  })

  it('should skip non-task list items', () => {
    const md = '## Todo\n\n- Regular item\n- [ ] Task item\n'
    const { tasks } = extract(md)

    expect(tasks).toHaveLength(1)
    expect(tasks[0].content).toBe('Task item')
  })
})

describe('checkbox-tasks mode: ID stability', () => {
  it('should produce stable IDs across parses', () => {
    const md = '## Todo\n\n- [ ] Task 1\n- [ ] Task 2\n'

    const cache = createIdCache()
    const ast1 = annotateIds(parseMarkdown(md), cache)
    const result1 = extractTasksAndColumns(ast1)

    const ast2 = annotateIds(parseMarkdown(md), cache)
    const result2 = extractTasksAndColumns(ast2)

    expect(result1.tasks[0].id).toBe(result2.tasks[0].id)
    expect(result1.tasks[1].id).toBe(result2.tasks[1].id)
    expect(result1.columns[0].id).toBe(result2.columns[0].id)
  })
})
