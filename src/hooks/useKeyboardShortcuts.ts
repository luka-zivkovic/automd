import { useEffect } from 'react'
import { useUiStore } from '@/store/ui-store'
import { useFileImport } from './useFileImport'
import { useFileExport } from './useFileExport'

export function useKeyboardShortcuts() {
  const setActiveView = useUiStore((s) => s.setActiveView)
  const { importFile } = useFileImport()
  const { exportFile } = useFileExport()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if inside an input/textarea (unless it's CodeMirror)
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA'
      ) {
        return
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault()
            setActiveView('editor')
            break
          case '2':
            e.preventDefault()
            setActiveView('checklist')
            break
          case '3':
            e.preventDefault()
            setActiveView('kanban')
            break
          case 's':
            e.preventDefault()
            exportFile()
            break
          case 'o':
            e.preventDefault()
            importFile()
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveView, importFile, exportFile])
}
