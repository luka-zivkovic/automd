import { useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'

export function useFileExport() {
  const markdown = useDocumentStore((s) => s.markdown)
  const activeFile = useFilesStore((s) => {
    const id = s.activeFileId
    return s.files.find(f => f.id === id)
  })

  const exportFile = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fileName = activeFile ? `${activeFile.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.md` : 'tasks.md'
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [markdown, activeFile])

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(markdown)
  }, [markdown])

  return { exportFile, copyToClipboard }
}
