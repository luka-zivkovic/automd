import { useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'

export function useFileImport() {
  const reparseFromMarkdown = useDocumentStore((s) => s.reparseFromMarkdown)

  const importFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      reparseFromMarkdown(text)
    }
    input.click()
  }, [reparseFromMarkdown])

  const importFromText = useCallback(
    (text: string) => {
      reparseFromMarkdown(text)
    },
    [reparseFromMarkdown]
  )

  return { importFile, importFromText }
}
