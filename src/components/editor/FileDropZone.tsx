import { useState, useCallback, type ReactNode } from 'react'
import { useFileImport } from '@/hooks/useFileImport'
import { Upload } from 'lucide-react'

interface FileDropZoneProps {
  children: ReactNode
}

export function FileDropZone({ children }: FileDropZoneProps) {
  const { importFromText } = useFileImport()
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      const mdFile = files.find(
        (f) =>
          f.name.endsWith('.md') ||
          f.name.endsWith('.markdown') ||
          f.name.endsWith('.txt')
      )

      if (mdFile) {
        if (mdFile.size > 5 * 1024 * 1024) {
          console.warn('[import] File too large (max 5 MB)')
          return
        }
        const text = await mdFile.text()
        importFromText(text)
      }
    },
    [importFromText]
  )

  return (
    <div
      className="relative h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center border-2 border-dashed border-primary/30 rounded-xl m-3 transition-all">
          <div className="text-center">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Upload className="size-6 text-primary" />
            </div>
            <p className="font-display text-xl text-foreground italic">
              Drop markdown file
            </p>
            <p className="text-xs text-muted-foreground mt-2">.md, .markdown, .txt</p>
          </div>
        </div>
      )}
    </div>
  )
}
