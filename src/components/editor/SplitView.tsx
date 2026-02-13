import { useCallback, useRef, type ReactNode } from 'react'
import { useUiStore } from '@/store/ui-store'

interface SplitViewProps {
  left: ReactNode
  right: ReactNode
}

export function SplitView({ left, right }: SplitViewProps) {
  const editorPanelWidth = useUiStore((s) => s.editorPanelWidth)
  const setEditorPanelWidth = useUiStore((s) => s.setEditorPanelWidth)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true

      const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const percent = ((e.clientX - rect.left) / rect.width) * 100
        setEditorPanelWidth(Math.max(20, Math.min(80, percent)))
      }

      const handleMouseUp = () => {
        isDragging.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setEditorPanelWidth]
  )

  return (
    <div ref={containerRef} className="flex h-full">
      <div className="overflow-hidden" style={{ width: `${editorPanelWidth}%` }}>
        {left}
      </div>
      <div
        onMouseDown={handleMouseDown}
        className="w-2 split-divider cursor-col-resize transition-colors shrink-0 hover:bg-primary/5"
      />
      <div className="flex-1 overflow-hidden border-l border-border">{right}</div>
    </div>
  )
}
