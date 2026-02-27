import { toString } from 'mdast-util-to-string'
import type { Root, Heading, List, ListItem, RootContent, Blockquote } from 'mdast'
import type { Task, Column } from './types.js'
import { parseMetadata } from './metadata-parser.js'

const UNCATEGORIZED_ID = '__uncategorized__'
const UNCATEGORIZED_TITLE = 'Tasks'

// ─── Heading Structure Detection ─────────────────────────────────────

export interface HeadingStructure {
  columnDepth: number
  taskDepth: number | null // null = checkbox-tasks mode (legacy)
  mode: 'heading-tasks' | 'checkbox-tasks'
}

/**
 * Detect the document's heading structure.
 *
 * - If H1 headings exist → heading-tasks mode: H1 = columns, H2 = tasks
 * - If only H2+ exist → checkbox-tasks mode (legacy): shallowest non-H1 = columns, checkboxes = tasks
 */
export function detectHeadingStructure(ast: Root): HeadingStructure {
  let hasH1 = false
  let hasH2 = false

  for (const child of ast.children) {
    if (child.type === 'heading') {
      const depth = (child as Heading).depth
      if (depth === 1) hasH1 = true
      if (depth === 2) hasH2 = true
    }
  }

  if (hasH1 && hasH2) {
    return { columnDepth: 1, taskDepth: 2, mode: 'heading-tasks' }
  }

  if (hasH1 && !hasH2) {
    // Only H1 headings, no H2 — treat H1 as columns with checkbox tasks (legacy-like)
    return { columnDepth: 1, taskDepth: null, mode: 'checkbox-tasks' }
  }

  // No H1 headings — legacy mode
  let minDepth = Infinity
  for (const child of ast.children) {
    if (child.type === 'heading') {
      const depth = (child as Heading).depth
      if (depth > 1 && depth < minDepth) {
        minDepth = depth
      }
    }
  }

  return {
    columnDepth: minDepth === Infinity ? 2 : minDepth,
    taskDepth: null,
    mode: 'checkbox-tasks',
  }
}

/**
 * Backward-compatible wrapper — returns the column heading depth.
 */
export function detectColumnDepth(ast: Root): number {
  return detectHeadingStructure(ast).columnDepth
}

// ─── Checkbox Task Helpers (Legacy Mode) ─────────────────────────────

function extractTaskContent(node: ListItem): string {
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      return toString(child)
    }
  }
  return toString(node)
}

function extractListItemDescription(node: ListItem): string | null {
  const paragraphs: string[] = []
  let isFirst = true
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      if (isFirst) {
        isFirst = false
        continue
      }
      paragraphs.push(toString(child))
    }
  }
  return paragraphs.length > 0 ? paragraphs.join('\n') : null
}

function extractSubtasksFromList(
  list: List,
  column: string,
  parentHeadingId: string,
  depth: number
): Task[] {
  const tasks: Task[] = []

  for (const item of list.children) {
    if (item.type !== 'listItem') continue
    if (item.checked === null || item.checked === undefined) continue

    const id = (item.data as Record<string, unknown>)?.automdId as string
    if (!id) continue

    // Extract nested subtasks
    const children: Task[] = []
    for (const child of item.children) {
      if (child.type === 'list') {
        children.push(
          ...extractSubtasksFromList(
            child as List,
            column,
            parentHeadingId,
            depth + 1
          )
        )
      }
    }

    const content = extractTaskContent(item)
    const { metadata, displayContent } = parseMetadata(content)
    const description = extractListItemDescription(item)

    tasks.push({
      id,
      content,
      displayContent,
      metadata,
      checked: item.checked ?? false,
      column,
      parentHeadingId,
      depth,
      description,
      acceptanceCriteria: null,
      learnings: null,
      children,
    })
  }

  return tasks
}

// ─── Heading-Tasks Mode Helpers ──────────────────────────────────────

// Match checkbox prefix in headings — handles escaped brackets from remark-stringify
const CHECKBOX_PREFIX = /^\s*\\?\[([ xX])\]\s*/

/**
 * Parse optional checkbox prefix from H2 heading text.
 * "[ ] Task name"  → { checked: false, text: "Task name" }
 * "[x] Task name"  → { checked: true, text: "Task name" }
 * "\[x] Task name" → { checked: true, text: "Task name" } (escaped by remark-stringify)
 * "Task name"      → { checked: null, text: "Task name" }
 */
function parseHeadingCheckbox(text: string): {
  checked: boolean | null
  text: string
} {
  const match = text.match(CHECKBOX_PREFIX)
  if (!match) return { checked: null, text }
  const isChecked = match[1].toLowerCase() === 'x'
  return { checked: isChecked, text: text.slice(match[0].length) }
}

/**
 * Extract a task from an H2 heading and the AST nodes following it
 * (up to the next H1 or H2).
 *
 * Returns the task and how many root children were consumed after the heading.
 */
function extractHeadingTask(
  children: RootContent[],
  startIndex: number,
  column: string,
  columnId: string,
  structure: HeadingStructure
): { task: Task; consumed: number } | null {
  const heading = children[startIndex] as Heading
  const id = (heading.data as Record<string, unknown>)?.automdId as string
  if (!id) return null

  const rawText = toString(heading)
  const { checked, text: cleanText } = parseHeadingCheckbox(rawText)
  const { metadata, displayContent } = parseMetadata(cleanText)

  // Collect description paragraphs, acceptance criteria blockquotes,
  // learnings (H3 section), and subtask lists after the heading
  const descriptionParts: string[] = []
  const acParts: string[] = []
  const learningsParts: string[] = []
  const subtasks: Task[] = []
  let consumed = 0
  let inLearnings = false

  for (let i = startIndex + 1; i < children.length; i++) {
    const node = children[i]

    // Stop at next column heading (H1) or task heading (H2)
    if (node.type === 'heading') {
      const d = (node as Heading).depth
      if (d === structure.columnDepth || d === structure.taskDepth) break

      // H3 "Learnings" section
      if (d === 3) {
        const headingText = toString(node as Heading).toLowerCase()
        if (headingText === 'learnings') {
          inLearnings = true
          consumed++
          continue
        }
        // Any other H3 exits learnings mode
        inLearnings = false
      }
    }

    consumed++

    if (inLearnings) {
      // Everything inside the ### Learnings section becomes learnings text
      if (node.type === 'list') {
        for (const item of (node as List).children) {
          if (item.type === 'listItem') {
            learningsParts.push(toString(item))
          }
        }
      } else if (node.type === 'paragraph') {
        learningsParts.push(toString(node))
      }
    } else if (node.type === 'paragraph') {
      descriptionParts.push(toString(node))
    } else if (node.type === 'blockquote') {
      acParts.push(toString(node as Blockquote))
    } else if (node.type === 'list') {
      // Extract subtasks from checkbox items in the list
      subtasks.push(
        ...extractSubtasksFromList(node as List, column, id, 0)
      )
    }
    // Skip other node types (thematic breaks, code blocks, etc.)
  }

  const description =
    descriptionParts.length > 0 ? descriptionParts.join('\n') : null
  const acceptanceCriteria =
    acParts.length > 0 ? acParts.join('\n') : null
  const learnings =
    learningsParts.length > 0 ? learningsParts.join('\n') : null

  return {
    task: {
      id,
      content: cleanText,
      displayContent,
      metadata,
      checked,
      column,
      parentHeadingId: columnId,
      depth: 0,
      description,
      acceptanceCriteria,
      learnings,
      children: subtasks,
    },
    consumed,
  }
}

// ─── Main Extraction ─────────────────────────────────────────────────

export function extractTasksAndColumns(ast: Root): {
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
} {
  const structure = detectHeadingStructure(ast)

  if (structure.mode === 'heading-tasks') {
    return extractHeadingMode(ast, structure)
  }
  return extractCheckboxMode(ast, structure)
}

/**
 * Heading-tasks mode: H1 = columns, H2 = tasks, checkboxes = subtasks
 */
function extractHeadingMode(
  ast: Root,
  structure: HeadingStructure
): {
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
} {
  const columns: Column[] = []
  const allTasks: Task[] = []
  const taskMap = new Map<string, Task>()

  let currentColumnId = UNCATEGORIZED_ID
  let currentColumnTitle = UNCATEGORIZED_TITLE
  let currentTasks: Task[] = []

  function flushColumn() {
    if (currentTasks.length > 0 || currentColumnId !== UNCATEGORIZED_ID) {
      columns.push({
        id: currentColumnId,
        title: currentColumnTitle,
        tasks: [...currentTasks],
      })
      allTasks.push(...currentTasks)
      currentTasks = []
    }
  }

  let i = 0
  while (i < ast.children.length) {
    const child = ast.children[i]

    if (child.type === 'heading') {
      const heading = child as Heading

      if (heading.depth === structure.columnDepth) {
        // H1 → new column
        flushColumn()
        currentColumnId =
          ((heading.data as Record<string, unknown>)?.automdId as string) ??
          UNCATEGORIZED_ID
        currentColumnTitle = toString(heading)
        i++
      } else if (heading.depth === structure.taskDepth) {
        // H2 → new task
        const result = extractHeadingTask(
          ast.children,
          i,
          currentColumnTitle,
          currentColumnId,
          structure
        )
        if (result) {
          currentTasks.push(result.task)
          i += 1 + result.consumed
        } else {
          i++
        }
      } else {
        i++
      }
    } else {
      i++
    }
  }

  // Flush last column
  flushColumn()

  // Build taskMap (tasks + subtasks recursively)
  function addToMap(tasks: Task[]) {
    for (const task of tasks) {
      taskMap.set(task.id, task)
      addToMap(task.children)
    }
  }
  addToMap(allTasks)

  return { tasks: allTasks, columns, taskMap }
}

/**
 * Checkbox-tasks mode (legacy): H2 = columns, checkbox list items = tasks
 */
function extractCheckboxMode(
  ast: Root,
  structure: HeadingStructure
): {
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
} {
  const columns: Column[] = []
  const allTasks: Task[] = []
  const taskMap = new Map<string, Task>()

  let currentHeadingId = UNCATEGORIZED_ID
  let currentHeadingTitle = UNCATEGORIZED_TITLE
  let currentTasks: Task[] = []

  function flushColumn() {
    if (currentTasks.length > 0 || currentHeadingId !== UNCATEGORIZED_ID) {
      columns.push({
        id: currentHeadingId,
        title: currentHeadingTitle,
        tasks: [...currentTasks],
      })
      allTasks.push(...currentTasks)
      currentTasks = []
    }
  }

  for (const child of ast.children) {
    if (
      child.type === 'heading' &&
      (child as Heading).depth === structure.columnDepth
    ) {
      flushColumn()
      const heading = child as Heading
      currentHeadingId =
        ((heading.data as Record<string, unknown>)?.automdId as string) ??
        UNCATEGORIZED_ID
      currentHeadingTitle = toString(heading)
    } else if (child.type === 'list') {
      const tasks = extractSubtasksFromList(
        child as List,
        currentHeadingTitle,
        currentHeadingId,
        0
      )
      currentTasks.push(...tasks)
    }
  }

  flushColumn()

  function addToMap(tasks: Task[]) {
    for (const task of tasks) {
      taskMap.set(task.id, task)
      addToMap(task.children)
    }
  }
  addToMap(allTasks)

  return { tasks: allTasks, columns, taskMap }
}
