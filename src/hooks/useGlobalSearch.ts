import { useMemo } from 'react'
import { useFilesStore } from '@/store/files-store'

export interface SearchResult {
  fileId: string
  fileName: string
  taskContent: string
  taskId: string
}

// Simple regex to match markdown task lines: - [ ] or - [x]
const TASK_LINE_RE = /^(\s*)-\s*\[([ xX])\]\s+(.+)$/
const HEADING_TASK_RE = /^##\s+(.+)$/

/**
 * Searches across all files in the files-store for tasks matching the query.
 * Performs lightweight text matching on raw markdown lines.
 */
export function useGlobalSearch(query: string): SearchResult[] {
  const files = useFilesStore((s) => s.files)
  const activeFileId = useFilesStore((s) => s.activeFileId)

  return useMemo(() => {
    if (!query || query.trim().length === 0) return []

    const q = query.toLowerCase().trim()
    const results: SearchResult[] = []

    for (const file of files) {
      // Skip the active file since those tasks are already shown from document-store
      if (file.id === activeFileId) continue

      const lines = file.markdown.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const checkboxMatch = TASK_LINE_RE.exec(lines[i])
        const headingMatch = !checkboxMatch ? HEADING_TASK_RE.exec(lines[i]) : null

        const taskContent = checkboxMatch ? checkboxMatch[3].trim() : headingMatch ? headingMatch[1].trim() : null
        if (!taskContent) continue

        if (taskContent.toLowerCase().includes(q)) {
          results.push({
            fileId: file.id,
            fileName: file.name,
            taskContent,
            // Use a synthetic ID since we don't parse full AST for other files
            taskId: `${file.id}:line-${i}`,
          })
        }
      }
    }

    return results
  }, [query, files, activeFileId])
}
