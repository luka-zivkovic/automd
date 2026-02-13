import { toString } from 'mdast-util-to-string'
import type { Root, Heading, List, ListItem } from 'mdast'
import type { Task, Column } from './types'
import { parseMetadata } from './metadata-parser'

const UNCATEGORIZED_ID = '__uncategorized__'
const UNCATEGORIZED_TITLE = 'Tasks'

function extractTaskContent(node: ListItem): string {
  for (const child of node.children) {
    if (child.type === 'paragraph') {
      return toString(child)
    }
  }
  return toString(node)
}

function extractDescription(node: ListItem): string | null {
  // Description comes from second+ paragraphs in the list item
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

function extractTasksFromList(
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

    // Extract sub-tasks from nested lists
    const children: Task[] = []
    for (const child of item.children) {
      if (child.type === 'list') {
        children.push(
          ...extractTasksFromList(
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
    const description = extractDescription(item)

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
      children,
    })
  }

  return tasks
}

export function extractTasksAndColumns(ast: Root): {
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
    if (currentTasks.length > 0) {
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
    if (child.type === 'heading' && (child as Heading).depth === 2) {
      // Flush previous column
      flushColumn()

      const heading = child as Heading
      currentHeadingId =
        ((heading.data as Record<string, unknown>)?.automdId as string) ??
        UNCATEGORIZED_ID
      currentHeadingTitle = toString(heading)
    } else if (child.type === 'list') {
      const tasks = extractTasksFromList(
        child as List,
        currentHeadingTitle,
        currentHeadingId,
        0
      )
      currentTasks.push(...tasks)
    }
  }

  // Flush last column
  flushColumn()

  // If we only had uncategorized tasks and no actual columns, that's fine
  // If we had headings but also uncategorized, prefix the uncategorized column
  // Build taskMap
  function addToMap(tasks: Task[]) {
    for (const task of tasks) {
      taskMap.set(task.id, task)
      addToMap(task.children)
    }
  }
  addToMap(allTasks)

  return { tasks: allTasks, columns, taskMap }
}
