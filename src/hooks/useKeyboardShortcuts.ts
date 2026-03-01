import { useEffect } from 'react'
import { useUiStore } from '@/store/ui-store'
import { useDocumentStore } from '@/store/document-store'
import { useFileImport } from './useFileImport'
import { useFileExport } from './useFileExport'

export function useKeyboardShortcuts() {
  const setActiveView = useUiStore((s) => s.setActiveView)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const { importFile } = useFileImport()
  const { exportFile } = useFileExport()
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const toggleSplitEditor = useUiStore((s) => s.toggleSplitEditor)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement

      // Ctrl+K: toggle command palette — works from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const current = useUiStore.getState().commandPaletteOpen
        setCommandPaletteOpen(!current)
        return
      }

      // Ctrl+Shift+P: toggle AI Workflows (prompts library) — works from anywhere
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        const current = useUiStore.getState().promptsLibraryOpen
        useUiStore.getState().setPromptsLibraryOpen(!current)
        return
      }

      // Undo/Redo: allow from anywhere EXCEPT CodeMirror editor
      // (CodeMirror handles its own undo/redo internally)
      if (e.ctrlKey || e.metaKey) {
        const isCodeMirror = target.closest('.cm-content') !== null

        if (!isCodeMirror) {
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault()
            undo()
            return
          }
          if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
            e.preventDefault()
            redo()
            return
          }
        }
      }

      // Other shortcuts: block from INPUT/TEXTAREA
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
            setActiveView('home')
            break
          case '2':
            e.preventDefault()
            setActiveView('editor')
            break
          case '3':
            e.preventDefault()
            setActiveView('checklist')
            break
          case '4':
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
          case 'b':
            e.preventDefault()
            setSidebarOpen(!useUiStore.getState().sidebarOpen)
            break
          case 'e': {
            const view = useUiStore.getState().activeView
            if (view === 'checklist' || view === 'kanban') {
              e.preventDefault()
              toggleSplitEditor()
            }
            break
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveView, importFile, exportFile, undo, redo, setSidebarOpen, setCommandPaletteOpen, toggleSplitEditor])
}
