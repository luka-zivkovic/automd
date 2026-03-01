import { useMemo } from 'react'
import { useFilesStore } from '@/store/files-store'
import { parseMarkdown } from '@/lib/markdown/parser'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'
import type { Task } from '@/lib/markdown/types'

export interface MemoryEntry {
  id: string
  title: string
  type: 'knowledge' | 'learning' | 'context'
  description: string | null
  learnings: string | null
  tags: string[]
  boardId: string
  boardName: string
  projectName: string | null
  taskId: string
}

function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  for (const task of tasks) {
    result.push(task)
    if (task.children.length > 0) {
      result.push(...flattenTasks(task.children))
    }
  }
  return result
}

export function useMemoryData() {
  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)

  const entries = useMemo(() => {
    const result: MemoryEntry[] = []

    for (const file of files) {
      try {
        const ast = parseMarkdown(file.markdown)
        const cache = createIdCache()
        const annotated = annotateIds(ast, cache)
        const { columns } = extractTasksAndColumns(annotated)
        const project = projects.find((p) => p.id === file.projectId)

        for (const col of columns) {
          const flat = flattenTasks(col.tasks)
          for (const task of flat) {
            const isKnowledge = task.metadata.knowledge === true
            const hasLearnings = !!task.learnings
            const hasDescription = !!task.description

            if (!isKnowledge && !hasLearnings && !hasDescription) continue

            result.push({
              id: `${file.id}:${task.id}`,
              title: task.displayContent,
              type: isKnowledge ? 'knowledge' : hasLearnings ? 'learning' : 'context',
              description: task.description,
              learnings: task.learnings,
              tags: task.metadata.labels,
              boardId: file.id,
              boardName: file.name,
              projectName: project?.name ?? null,
              taskId: task.id,
            })
          }
        }
      } catch {
        // Skip files that fail to parse
      }
    }

    // Knowledge notes first, then learnings, then context
    result.sort((a, b) => {
      const order = { knowledge: 0, learning: 1, context: 2 }
      return order[a.type] - order[b.type]
    })

    return result
  }, [files, projects])

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    for (const entry of entries) {
      for (const tag of entry.tags) tagSet.add(tag)
    }
    return Array.from(tagSet).sort()
  }, [entries])

  const allBoards = useMemo(() => {
    const boardSet = new Set<string>()
    for (const entry of entries) boardSet.add(entry.boardName)
    return Array.from(boardSet).sort()
  }, [entries])

  const allProjects = useMemo(() => {
    const projectSet = new Set<string>()
    for (const entry of entries) {
      if (entry.projectName) projectSet.add(entry.projectName)
    }
    return Array.from(projectSet).sort()
  }, [entries])

  return { entries, allTags, allBoards, allProjects }
}
