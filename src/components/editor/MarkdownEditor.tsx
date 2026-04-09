import { useCallback, useEffect, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { useDocumentStore } from '@/store/document-store'
import { computeMinimalChange } from '@/lib/sync/diff'
import { createDebouncedReparse } from '@/lib/sync/sync-engine'

const extensions = [
  markdown(),
  EditorView.lineWrapping,
]

export function MarkdownEditor() {
  const md = useDocumentStore((s) => s.markdown)
  const setMarkdown = useDocumentStore((s) => s.setMarkdown)
  const reparseFromMarkdown = useDocumentStore((s) => s.reparseFromMarkdown)

  const editorRef = useRef<ReactCodeMirrorRef>(null)
  const isEditorOrigin = useRef(false)

  // Debounced re-parse for editor typing
  const debouncedReparse = useRef(
    createDebouncedReparse((newMd: string) => {
      reparseFromMarkdown(newMd)
    }, 300)
  )

  useEffect(() => {
    return () => {
      debouncedReparse.current.cancel()
    }
  }, [])

  const onChange = useCallback(
    (value: string) => {
      isEditorOrigin.current = true
      setMarkdown(value)
      debouncedReparse.current.trigger(value)
      queueMicrotask(() => {
        isEditorOrigin.current = false
      })
    },
    [setMarkdown]
  )

  // Listen for store changes from UI actions (toggle/drag) and apply minimal diff
  useEffect(() => {
    const unsub = useDocumentStore.subscribe(
      (state) => state.markdown,
      (newMd) => {
        if (isEditorOrigin.current) return
        const view = editorRef.current?.view
        if (!view) return

        const currentText = view.state.doc.toString()
        const change = computeMinimalChange(currentText, newMd)
        if (change) {
          view.dispatch({ changes: change })
        }
      }
    )
    return unsub
  }, [])

  return (
    <div className="h-full overflow-auto">
      <CodeMirror
        ref={editorRef}
        value={md}
        onChange={onChange}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          bracketMatching: false,
        }}
        className="h-full text-sm"
        height="100%"
      />
    </div>
  )
}
