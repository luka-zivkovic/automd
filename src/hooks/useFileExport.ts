import { useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'

export function useFileExport() {
  const markdown = useDocumentStore((s) => s.markdown)

  const exportFile = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tasks.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [markdown])

  const copyToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(markdown)
  }, [markdown])

  return { exportFile, copyToClipboard }
}
