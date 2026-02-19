import { visit } from 'unist-util-visit'
import type {
  Root,
  Heading,
  List,
  ListItem,
  Paragraph,
  Text,
  Content,
  RootContent,
} from 'mdast'
import { toString } from 'mdast-util-to-string'
import type { TaskMetadata } from './types.js'
import { serializeMetadata } from './metadata-serializer.js'
import { detectHeadingStructure } from './task-extractor.js'

// ─── Shared Helpers ──────────────────────────────────────────────────

function findListItemById(
  ast: Root,
  id: string
): { node: ListItem; parent: List; index: number } | null {
  let result: { node: ListItem; parent: List; index: number } | null = null

  visit(ast, 'listItem', (node: ListItem, index, parent) => {
    if (result) return
    const nodeId = (node.data as Record<string, unknown>)?.automdId
    if (nodeId === id && parent && parent.type === 'list' && index != null) {
      result = { node, parent: parent as List, index }
    }
  })

  return result
}

function findColumnHeadingById(
  ast: Root,
  id: string
): { node: Heading; rootIndex: number } | null {
  const { columnDepth } = detectHeadingStructure(ast)
  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      (child as Heading).depth === columnDepth &&
      (child.data as Record<string, unknown>)?.automdId === id
    ) {
      return { node: child as Heading, rootIndex: i }
    }
  }
  return null
}

function findColumnBlockEnd(ast: Root, headingRootIndex: number): number {
  const { columnDepth } = detectHeadingStructure(ast)
  for (let i = headingRootIndex + 1; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'heading' && (child as Heading).depth === columnDepth) {
      return i
    }
  }
  return ast.children.length
}

function getInsertionPointForColumnIndex(
  ast: Root,
  targetIndex: number
): number {
  const { columnDepth } = detectHeadingStructure(ast)
  let colCount = 0
  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'heading' && (child as Heading).depth === columnDepth) {
      if (colCount === targetIndex) return i
      colCount++
    }
  }
  return ast.children.length
}

// ─── Heading-Tasks Mode Helpers ──────────────────────────────────────

// Match checkbox prefix in headings — handles escaped brackets from remark-stringify
const CHECKBOX_PREFIX = /^\s*\\?\[([ xX])\]\s*/

function findTaskHeadingById(
  ast: Root,
  id: string
): { node: Heading; rootIndex: number } | null {
  const structure = detectHeadingStructure(ast)
  if (structure.taskDepth === null) return null

  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      (child as Heading).depth === structure.taskDepth &&
      (child.data as Record<string, unknown>)?.automdId === id
    ) {
      return { node: child as Heading, rootIndex: i }
    }
  }
  return null
}

/**
 * Find the end of a task block (H2 heading + description + subtask list).
 * Stops at next H1 (column) or H2 (task) heading.
 */
function findTaskBlockEnd(ast: Root, taskRootIndex: number): number {
  const structure = detectHeadingStructure(ast)
  for (let i = taskRootIndex + 1; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'heading') {
      const d = (child as Heading).depth
      if (
        d === structure.columnDepth ||
        d === structure.taskDepth
      ) {
        return i
      }
    }
  }
  return ast.children.length
}

/**
 * Get the insertion point for the Nth task heading within a column block.
 */
function getTaskInsertionPoint(
  ast: Root,
  columnRootIndex: number,
  targetIndex: number
): number {
  const structure = detectHeadingStructure(ast)
  const columnEnd = findColumnBlockEnd(ast, columnRootIndex)
  let taskCount = 0

  for (let i = columnRootIndex + 1; i < columnEnd; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      structure.taskDepth !== null &&
      (child as Heading).depth === structure.taskDepth
    ) {
      if (taskCount === targetIndex) return i
      taskCount++
    }
  }
  return columnEnd
}

// ─── Checkbox-Tasks Mode Helpers ─────────────────────────────────────

function findListAfterHeading(
  ast: Root,
  headingRootIndex: number
): { list: List; rootIndex: number } | null {
  const { columnDepth } = detectHeadingStructure(ast)
  for (let i = headingRootIndex + 1; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'heading' && (child as Heading).depth === columnDepth) {
      return null
    }
    if (child.type === 'list') {
      return { list: child as List, rootIndex: i }
    }
  }
  return null
}

// ─── Task Mutations ──────────────────────────────────────────────────

export function toggleTask(ast: Root, taskId: string): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  if (structure.mode === 'heading-tasks') {
    // First try: H2 task heading with [ ] / [x] prefix
    const taskHeading = findTaskHeadingById(cloned, taskId)
    if (taskHeading) {
      const text = toString(taskHeading.node)
      const match = text.match(CHECKBOX_PREFIX)
      if (match) {
        // Toggle [x] ↔ [ ]
        const isChecked = match[1].toLowerCase() === 'x'
        const newPrefix = isChecked ? '[ ] ' : '[x] '
        const newText = newPrefix + text.slice(match[0].length)
        for (const child of taskHeading.node.children) {
          if (child.type === 'text') {
            ;(child as Text).value = newText
            break
          }
        }
      } else {
        // No checkbox prefix — add one (checked)
        const newText = '[x] ' + text
        for (const child of taskHeading.node.children) {
          if (child.type === 'text') {
            ;(child as Text).value = newText
            break
          }
        }
      }
      return cloned
    }

    // Fall through: try as subtask (checkbox list item)
    const found = findListItemById(cloned, taskId)
    if (found) {
      found.node.checked = !found.node.checked
    }
    return cloned
  }

  // Checkbox-tasks mode (legacy)
  const found = findListItemById(cloned, taskId)
  if (!found) return cloned
  found.node.checked = !found.node.checked
  return cloned
}

export function moveTask(
  ast: Root,
  taskId: string,
  targetColumnId: string,
  targetIndex: number
): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  if (structure.mode === 'heading-tasks') {
    // Move H2 task heading block between columns
    const taskHeading = findTaskHeadingById(cloned, taskId)
    if (!taskHeading) return cloned

    // Extract the full task block
    const blockEnd = findTaskBlockEnd(cloned, taskHeading.rootIndex)
    const blockNodes = cloned.children.splice(
      taskHeading.rootIndex,
      blockEnd - taskHeading.rootIndex
    )

    // Find target column and insertion point
    const targetColumn = findColumnHeadingById(cloned, targetColumnId)
    if (!targetColumn) return cloned

    const insertAt = getTaskInsertionPoint(
      cloned,
      targetColumn.rootIndex,
      targetIndex
    )
    cloned.children.splice(insertAt, 0, ...blockNodes)

    return cloned
  }

  // Checkbox-tasks mode (legacy)
  const found = findListItemById(cloned, taskId)
  if (!found) return cloned

  const removedItem = found.parent.children.splice(found.index, 1)[0]

  if (found.parent.children.length === 0) {
    const listIdx = cloned.children.indexOf(found.parent as Content)
    if (listIdx !== -1) {
      cloned.children.splice(listIdx, 1)
    }
  }

  const targetHeading = findColumnHeadingById(cloned, targetColumnId)
  if (!targetHeading) return cloned

  let targetList = findListAfterHeading(cloned, targetHeading.rootIndex)
  if (!targetList) {
    const newList: List = {
      type: 'list',
      ordered: false,
      spread: false,
      children: [],
    }
    const insertAt = targetHeading.rootIndex + 1
    cloned.children.splice(insertAt, 0, newList as Content)
    targetList = { list: newList, rootIndex: insertAt }
  }

  const clampedIndex = Math.min(targetIndex, targetList.list.children.length)
  targetList.list.children.splice(clampedIndex, 0, removedItem)
  return cloned
}

export function addTask(
  ast: Root,
  columnId: string,
  content: string,
  id: string
): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  if (structure.mode === 'heading-tasks') {
    // Create new H2 heading for the task
    const newHeading: Heading = {
      type: 'heading',
      depth: structure.taskDepth as Heading['depth'],
      children: [{ type: 'text', value: content } as Text],
      data: { automdId: id },
    }

    const column = findColumnHeadingById(cloned, columnId)
    if (!column) {
      cloned.children.push(newHeading as RootContent)
      return cloned
    }

    // Insert at end of column block (before next column heading)
    const columnEnd = findColumnBlockEnd(cloned, column.rootIndex)
    cloned.children.splice(columnEnd, 0, newHeading as RootContent)
    return cloned
  }

  // Checkbox-tasks mode (legacy)
  const newItem: ListItem = {
    type: 'listItem',
    checked: false,
    spread: false,
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: content } as Text],
      } as Paragraph,
    ],
    data: { automdId: id },
  }

  const heading = findColumnHeadingById(cloned, columnId)
  if (!heading) {
    const lastList = [...cloned.children]
      .reverse()
      .find((c: RootContent) => c.type === 'list')
    if (lastList && lastList.type === 'list') {
      ;(lastList as List).children.push(newItem)
    } else {
      const newList: List = {
        type: 'list',
        ordered: false,
        spread: false,
        children: [newItem],
      }
      cloned.children.push(newList as Content)
    }
    return cloned
  }

  let targetList = findListAfterHeading(cloned, heading.rootIndex)
  if (!targetList) {
    const newList: List = {
      type: 'list',
      ordered: false,
      spread: false,
      children: [],
    }
    cloned.children.splice(heading.rootIndex + 1, 0, newList as Content)
    targetList = { list: newList, rootIndex: heading.rootIndex + 1 }
  }

  targetList.list.children.push(newItem)
  return cloned
}

export function updateTaskContent(
  ast: Root,
  taskId: string,
  newContent: string
): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  if (structure.mode === 'heading-tasks') {
    // Try H2 task heading first
    const taskHeading = findTaskHeadingById(cloned, taskId)
    if (taskHeading) {
      // Preserve checkbox prefix if it exists
      const currentText = toString(taskHeading.node)
      const match = currentText.match(CHECKBOX_PREFIX)
      const prefix = match ? match[0] : ''
      for (const child of taskHeading.node.children) {
        if (child.type === 'text') {
          ;(child as Text).value = prefix + newContent
          break
        }
      }
      return cloned
    }

    // Fall through: try as subtask (checkbox list item)
    const found = findListItemById(cloned, taskId)
    if (found) {
      for (const child of found.node.children) {
        if (child.type === 'paragraph') {
          child.children = [{ type: 'text', value: newContent } as Text]
          break
        }
      }
    }
    return cloned
  }

  // Checkbox-tasks mode (legacy)
  const found = findListItemById(cloned, taskId)
  if (!found) return cloned

  for (const child of found.node.children) {
    if (child.type === 'paragraph') {
      child.children = [{ type: 'text', value: newContent } as Text]
      break
    }
  }
  return cloned
}

export function updateTaskMetadata(
  ast: Root,
  taskId: string,
  displayContent: string,
  metadata: TaskMetadata
): Root {
  const newContent = serializeMetadata(displayContent, metadata)
  return updateTaskContent(ast, taskId, newContent)
}

export function updateTaskDescription(
  ast: Root,
  taskId: string,
  description: string | null
): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  if (structure.mode === 'heading-tasks') {
    // Find the H2 task heading and modify paragraphs in its block
    const taskHeading = findTaskHeadingById(cloned, taskId)
    if (!taskHeading) return cloned

    const blockEnd = findTaskBlockEnd(cloned, taskHeading.rootIndex)

    // Remove existing description paragraphs (keep heading and lists)
    const toRemove: number[] = []
    for (let i = taskHeading.rootIndex + 1; i < blockEnd; i++) {
      if (cloned.children[i].type === 'paragraph') {
        toRemove.push(i)
      }
    }
    // Remove in reverse order to preserve indices
    for (let j = toRemove.length - 1; j >= 0; j--) {
      cloned.children.splice(toRemove[j], 1)
    }

    // Insert new description paragraphs right after the heading
    if (description && description.trim()) {
      const newParagraphs: RootContent[] = description
        .split('\n')
        .filter(Boolean)
        .map((line) => ({
          type: 'paragraph' as const,
          children: [{ type: 'text', value: line } as Text],
        }))
      cloned.children.splice(
        taskHeading.rootIndex + 1,
        0,
        ...newParagraphs
      )
    }

    return cloned
  }

  // Checkbox-tasks mode (legacy)
  const found = findListItemById(cloned, taskId)
  if (!found) return cloned

  found.node.children = found.node.children.filter((child, idx) => {
    if (child.type !== 'paragraph') return true
    const pIdx = found.node.children
      .slice(0, idx + 1)
      .filter((c) => c.type === 'paragraph').length
    return pIdx <= 1
  })

  if (description && description.trim()) {
    for (const line of description.split('\n').filter(Boolean)) {
      found.node.children.push({
        type: 'paragraph',
        children: [{ type: 'text', value: line } as Text],
      } as Paragraph)
    }
  }

  return cloned
}

export function deleteTask(ast: Root, taskId: string): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  if (structure.mode === 'heading-tasks') {
    // Try H2 task heading first
    const taskHeading = findTaskHeadingById(cloned, taskId)
    if (taskHeading) {
      const blockEnd = findTaskBlockEnd(cloned, taskHeading.rootIndex)
      cloned.children.splice(
        taskHeading.rootIndex,
        blockEnd - taskHeading.rootIndex
      )
      return cloned
    }

    // Fall through: try as subtask (checkbox list item)
    const found = findListItemById(cloned, taskId)
    if (found) {
      found.parent.children.splice(found.index, 1)
      if (found.parent.children.length === 0) {
        const listIdx = cloned.children.indexOf(found.parent as Content)
        if (listIdx !== -1) {
          cloned.children.splice(listIdx, 1)
        }
      }
    }
    return cloned
  }

  // Checkbox-tasks mode (legacy)
  const found = findListItemById(cloned, taskId)
  if (!found) return cloned

  found.parent.children.splice(found.index, 1)
  if (found.parent.children.length === 0) {
    const listIdx = cloned.children.indexOf(found.parent as Content)
    if (listIdx !== -1) {
      cloned.children.splice(listIdx, 1)
    }
  }
  return cloned
}

// ─── Subtask Mutations (heading-tasks mode) ──────────────────────────

export function addSubtask(
  ast: Root,
  taskId: string,
  content: string,
  id: string
): Root {
  const cloned = structuredClone(ast)
  const structure = detectHeadingStructure(cloned)

  const newItem: ListItem = {
    type: 'listItem',
    checked: false,
    spread: false,
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: content } as Text],
      } as Paragraph,
    ],
    data: { automdId: id },
  }

  if (structure.mode === 'heading-tasks') {
    const taskHeading = findTaskHeadingById(cloned, taskId)
    if (!taskHeading) return cloned

    const blockEnd = findTaskBlockEnd(cloned, taskHeading.rootIndex)

    // Find existing list in the task block
    let listIndex: number | null = null
    for (let i = taskHeading.rootIndex + 1; i < blockEnd; i++) {
      if (cloned.children[i].type === 'list') {
        listIndex = i
        break
      }
    }

    if (listIndex !== null) {
      ;(cloned.children[listIndex] as List).children.push(newItem)
    } else {
      // Create new list at end of task block
      const newList: List = {
        type: 'list',
        ordered: false,
        spread: false,
        children: [newItem],
      }
      cloned.children.splice(blockEnd, 0, newList as RootContent)
    }
    return cloned
  }

  // Checkbox-tasks mode: add as nested child of parent task list item
  const parentItem = findListItemById(cloned, taskId)
  if (!parentItem) return cloned

  // Find or create nested list
  let nestedList: List | null = null
  for (const child of parentItem.node.children) {
    if (child.type === 'list') {
      nestedList = child as List
      break
    }
  }

  if (!nestedList) {
    nestedList = {
      type: 'list',
      ordered: false,
      spread: false,
      children: [],
    }
    parentItem.node.children.push(nestedList)
  }

  nestedList.children.push(newItem)
  return cloned
}

export function toggleSubtask(ast: Root, subtaskId: string): Root {
  const cloned = structuredClone(ast)
  const found = findListItemById(cloned, subtaskId)
  if (!found) return cloned
  found.node.checked = !found.node.checked
  return cloned
}

export function deleteSubtask(ast: Root, subtaskId: string): Root {
  const cloned = structuredClone(ast)
  const found = findListItemById(cloned, subtaskId)
  if (!found) return cloned

  found.parent.children.splice(found.index, 1)
  if (found.parent.children.length === 0) {
    const listIdx = cloned.children.indexOf(found.parent as Content)
    if (listIdx !== -1) {
      cloned.children.splice(listIdx, 1)
    }
  }
  return cloned
}

// ─── Column Mutations ────────────────────────────────────────────────

export function addColumn(ast: Root, title: string): Root {
  const cloned = structuredClone(ast)
  const { columnDepth } = detectHeadingStructure(cloned)

  const newHeading: Heading = {
    type: 'heading',
    depth: columnDepth as Heading['depth'],
    children: [{ type: 'text', value: title } as Text],
  }

  cloned.children.push(newHeading as RootContent)
  return cloned
}

export function renameColumn(
  ast: Root,
  columnId: string,
  newTitle: string
): Root {
  const cloned = structuredClone(ast)
  const found = findColumnHeadingById(cloned, columnId)
  if (!found) return cloned

  for (const child of found.node.children) {
    if (child.type === 'text') {
      ;(child as Text).value = newTitle
      break
    }
  }

  return cloned
}

export function deleteColumn(ast: Root, columnId: string): Root {
  const cloned = structuredClone(ast)
  const found = findColumnHeadingById(cloned, columnId)
  if (!found) return cloned

  const blockEnd = findColumnBlockEnd(cloned, found.rootIndex)
  cloned.children.splice(found.rootIndex, blockEnd - found.rootIndex)
  return cloned
}

export function moveColumn(
  ast: Root,
  columnId: string,
  targetIndex: number
): Root {
  const cloned = structuredClone(ast)
  const found = findColumnHeadingById(cloned, columnId)
  if (!found) return cloned

  const blockEnd = findColumnBlockEnd(cloned, found.rootIndex)
  const blockNodes = cloned.children.splice(
    found.rootIndex,
    blockEnd - found.rootIndex
  )

  const insertAt = getInsertionPointForColumnIndex(cloned, targetIndex)
  cloned.children.splice(insertAt, 0, ...blockNodes)
  return cloned
}
