import { useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'

export function useFileImport() {
  const reparseFromMarkdown = useDocumentStore((s) => s.reparseFromMarkdown)

  const importFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt'
    input.style.display = 'none'
    document.body.appendChild(input)
    input.onchange = async (e) => {
      document.body.removeChild(input)
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      if (file.size > 5 * 1024 * 1024) {
        console.warn('[import] File too large (max 5 MB)')
        return
      }
      const text = await file.text()
      reparseFromMarkdown(text)
    }
    input.click()
    // Clean up if user cancels the dialog without selecting a file
    setTimeout(() => {
      if (input.parentNode) document.body.removeChild(input)
    }, 60000)
  }, [reparseFromMarkdown])

  const importFromText = useCallback(
    (text: string) => {
      reparseFromMarkdown(text)
    },
    [reparseFromMarkdown]
  )

  return { importFile, importFromText }
}
