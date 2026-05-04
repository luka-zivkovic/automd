import { useMemo } from 'react'
import { useFilesStore } from '@/store/files-store'
import { parseMarkdown } from '@/lib/markdown/parser'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'
import type { BoardFile } from '@/lib/markdown/types'

export interface SearchResult {
  fileId: string
  fileName: string
  taskContent: string
  taskId: string
  column: string
}

export function searchFiles(query: string, files: BoardFile[], activeFileId: string | null): SearchResult[] {
  if (!query || query.trim().length === 0) return []

  const q = query.toLowerCase().trim()
  const results: SearchResult[] = []

  for (const file of files) {
    // Active-file tasks are supplied by document-store so selectedTaskId works.
    if (file.id === activeFileId) continue

    try {
      const ast = annotateIds(parseMarkdown(file.markdown), createIdCache())
      const { tasks } = extractTasksAndColumns(ast)
      for (const task of tasks) {
        const searchable = [task.displayContent, task.content, task.description, task.acceptanceCriteria, task.learnings]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!searchable.includes(q)) continue
        results.push({
          fileId: file.id,
          fileName: file.name,
          taskContent: task.displayContent,
          taskId: task.id,
          column: task.column,
        })
      }
    } catch {
      // Ignore malformed markdown in palette search; raw editor still handles it.
    }
  }

  return results
}

/** Searches parsed tasks across all non-active files. */
export function useGlobalSearch(query: string): SearchResult[] {
  const files = useFilesStore((s) => s.files)
  const activeFileId = useFilesStore((s) => s.activeFileId)

  return useMemo(() => searchFiles(query, files, activeFileId), [query, files, activeFileId])
}
