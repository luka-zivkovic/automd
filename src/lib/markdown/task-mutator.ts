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
import type { TaskMetadata } from './types'
import { serializeMetadata } from './metadata-serializer'

function findNodeById(
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

function findHeadingById(ast: Root, id: string): { node: Heading; rootIndex: number } | null {
  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (
      child.type === 'heading' &&
      (child as Heading).depth === 2 &&
      (child.data as Record<string, unknown>)?.automdId === id
    ) {
      return { node: child as Heading, rootIndex: i }
    }
  }
  return null
}

function findListAfterHeading(ast: Root, headingRootIndex: number): { list: List; rootIndex: number } | null {
  // Look for the first list node after the heading, before the next heading
  for (let i = headingRootIndex + 1; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'heading' && (child as Heading).depth === 2) {
      return null // Hit the next heading, no list found
    }
    if (child.type === 'list') {
      return { list: child as List, rootIndex: i }
    }
  }
  return null
}

export function toggleTask(ast: Root, taskId: string): Root {
  const cloned = structuredClone(ast)
  const found = findNodeById(cloned, taskId)
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

  // Find and remove the task from its current location
  const found = findNodeById(cloned, taskId)
  if (!found) return cloned

  const removedItem = found.parent.children.splice(found.index, 1)[0]

  // Clean up empty lists
  if (found.parent.children.length === 0) {
    // Remove the empty list from the root
    const listIdx = cloned.children.indexOf(found.parent as Content)
    if (listIdx !== -1) {
      cloned.children.splice(listIdx, 1)
    }
  }

  // Find the target heading
  const targetHeading = findHeadingById(cloned, targetColumnId)
  if (!targetHeading) return cloned

  // Find or create a list after the target heading
  let targetList = findListAfterHeading(cloned, targetHeading.rootIndex)

  if (!targetList) {
    // Create a new list after the heading
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

  // Insert the task at the target index
  const clampedIndex = Math.min(
    targetIndex,
    targetList.list.children.length
  )
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

  // Find the target heading
  const heading = findHeadingById(cloned, columnId)
  if (!heading) {
    // If no heading found, append to the end of the document in a new list
    const lastList = [...cloned.children].reverse().find((c: RootContent) => c.type === 'list')
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

  // Find or create a list after the heading
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
  const found = findNodeById(cloned, taskId)
  if (!found) return cloned

  // Replace the text content in the first paragraph
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

export function deleteTask(ast: Root, taskId: string): Root {
  const cloned = structuredClone(ast)
  const found = findNodeById(cloned, taskId)
  if (!found) return cloned

  found.parent.children.splice(found.index, 1)

  // Clean up empty lists
  if (found.parent.children.length === 0) {
    const listIdx = cloned.children.indexOf(found.parent as Content)
    if (listIdx !== -1) {
      cloned.children.splice(listIdx, 1)
    }
  }

  return cloned
}
