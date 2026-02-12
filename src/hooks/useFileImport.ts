import { useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'

export function useFileImport() {
  const setMarkdown = useDocumentStore((s) => s.setMarkdown)
  const reparseFromMarkdown = useDocumentStore((s) => s.reparseFromMarkdown)

  const importFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      setMarkdown(text)
      reparseFromMarkdown(text)
    }
    input.click()
  }, [setMarkdown, reparseFromMarkdown])

  const importFromText = useCallback(
    (text: string) => {
      setMarkdown(text)
      reparseFromMarkdown(text)
    },
    [setMarkdown, reparseFromMarkdown]
  )

  return { importFile, importFromText }
}
