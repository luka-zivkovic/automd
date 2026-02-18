import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import { nanoid } from 'nanoid'
import type { Root, Heading, ListItem, Content } from 'mdast'
import type { IdCache } from './types'
import { detectHeadingStructure } from './task-extractor'

export function createIdCache(): IdCache {
  return {
    fingerprints: new Map(),
    ids: new Map(),
  }
}

// Strip optional checkbox prefix from heading text for stable fingerprints
// so toggling [ ] ↔ [x] doesn't change the task ID
const CHECKBOX_PREFIX_RE = /^\s*\\?\[([ xX])\]\s*/

function getNodeFingerprint(
  node: Heading | ListItem,
  index: number,
  scope: string
): string {
  let text = toString(node).slice(0, 80)
  if (node.type === 'heading') {
    text = text.replace(CHECKBOX_PREFIX_RE, '')
  }
  return `${scope}:${node.type}:${index}:${text}`
}

function getOrCreateId(fingerprint: string, cache: IdCache): string {
  const existing = cache.fingerprints.get(fingerprint)
  if (existing) return existing
  const id = nanoid(10)
  cache.fingerprints.set(fingerprint, id)
  cache.ids.set(id, fingerprint)
  return id
}

export function annotateIds(ast: Root, cache: IdCache): Root {
  const structure = detectHeadingStructure(ast)

  if (structure.mode === 'heading-tasks') {
    return annotateHeadingMode(ast, cache, structure)
  }
  return annotateCheckboxMode(ast, cache, structure)
}

/**
 * Heading-tasks mode: H1 = columns, H2 = tasks, checkboxes = subtasks
 */
function annotateHeadingMode(
  ast: Root,
  cache: IdCache,
  structure: { columnDepth: number; taskDepth: number | null }
): Root {
  // Pass 1: Annotate column headings (H1)
  let columnIndex = 0
  const columnEntries: { rootIndex: number; id: string }[] = []

  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      (child as Heading).depth === structure.columnDepth
    ) {
      const heading = child as Heading
      const fingerprint = getNodeFingerprint(
        heading,
        columnIndex++,
        '__heading__'
      )
      const id = getOrCreateId(fingerprint, cache)
      if (!heading.data) heading.data = {}
      ;(heading.data as Record<string, unknown>).automdId = id
      columnEntries.push({ rootIndex: i, id })
    }
  }

  // Pass 2: Annotate task headings (H2) scoped under their column
  let taskIndex = 0
  const taskEntries: { rootIndex: number; id: string }[] = []

  function findOwningColumnId(rootIndex: number): string {
    let owning = '__root__'
    for (const entry of columnEntries) {
      if (entry.rootIndex <= rootIndex) {
        owning = entry.id
      } else {
        break
      }
    }
    return owning
  }

  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      structure.taskDepth !== null &&
      (child as Heading).depth === structure.taskDepth
    ) {
      const heading = child as Heading
      const columnId = findOwningColumnId(i)
      const fingerprint = getNodeFingerprint(heading, taskIndex++, columnId)
      const id = getOrCreateId(fingerprint, cache)
      if (!heading.data) heading.data = {}
      ;(heading.data as Record<string, unknown>).automdId = id
      taskEntries.push({ rootIndex: i, id })
    }
  }

  // Pass 3: Annotate subtask list items (checkboxes) scoped under their task heading
  function findOwningTaskId(rootIndex: number): string {
    let owning = findOwningColumnId(rootIndex)
    for (const entry of taskEntries) {
      if (entry.rootIndex <= rootIndex) {
        owning = entry.id
      } else {
        break
      }
    }
    return owning
  }

  const subtaskCountByScope = new Map<string, number>()

  for (let i = 0; i < ast.children.length; i++) {
    const rootChild = ast.children[i]
    // Skip heading nodes themselves
    if (rootChild.type === 'heading') continue

    const scope = findOwningTaskId(i)

    visit(rootChild as Content, 'listItem', (node: ListItem) => {
      if (node.checked === null || node.checked === undefined) return

      const count = subtaskCountByScope.get(scope) ?? 0
      subtaskCountByScope.set(scope, count + 1)

      const fingerprint = getNodeFingerprint(node, count, scope)
      const id = getOrCreateId(fingerprint, cache)
      if (!node.data) node.data = {}
      ;(node.data as Record<string, unknown>).automdId = id
    })
  }

  return ast
}

/**
 * Checkbox-tasks mode (legacy): H2 = columns, checkbox list items = tasks
 */
function annotateCheckboxMode(
  ast: Root,
  cache: IdCache,
  structure: { columnDepth: number }
): Root {
  // Pass 1: annotate column headings
  let headingIndex = 0
  const headingEntries: { index: number; id: string }[] = []

  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      (child as Heading).depth === structure.columnDepth
    ) {
      const heading = child as Heading
      const fingerprint = getNodeFingerprint(
        heading,
        headingIndex++,
        '__heading__'
      )
      const id = getOrCreateId(fingerprint, cache)
      if (!heading.data) heading.data = {}
      ;(heading.data as Record<string, unknown>).automdId = id
      headingEntries.push({ index: i, id })
    }
  }

  // Pass 2: annotate task list items
  const taskCountByScope = new Map<string, number>()

  function findOwningHeadingId(rootChildIndex: number): string {
    let owning = '__root__'
    for (const entry of headingEntries) {
      if (entry.index <= rootChildIndex) {
        owning = entry.id
      } else {
        break
      }
    }
    return owning
  }

  for (let i = 0; i < ast.children.length; i++) {
    const rootChild = ast.children[i]
    const scope = findOwningHeadingId(i)

    visit(rootChild as Content, 'listItem', (node: ListItem) => {
      if (node.checked === null || node.checked === undefined) return

      const count = taskCountByScope.get(scope) ?? 0
      taskCountByScope.set(scope, count + 1)

      const fingerprint = getNodeFingerprint(node, count, scope)
      const id = getOrCreateId(fingerprint, cache)
      if (!node.data) node.data = {}
      ;(node.data as Record<string, unknown>).automdId = id
    })
  }

  return ast
}
