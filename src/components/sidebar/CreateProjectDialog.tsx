import { useState, useRef, useEffect, useCallback } from 'react'
import { useFilesStore } from '@/store/files-store'
import { Button } from '@/components/ui/button'
import { PROJECT_COLOR_NAMES, getProjectColorClass } from '@/lib/utils/project-colors'

interface CreateProjectDialogProps {
  onClose: () => void
}

export function CreateProjectDialog({ onClose }: CreateProjectDialogProps) {
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState('blue')
  const inputRef = useRef<HTMLInputElement>(null)

  const createProject = useFilesStore((s) => s.createProject)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleCreate = useCallback(() => {
    const trimmed = name.trim()
    if (!trimmed) return
    createProject(trimmed, selectedColor)
    onClose()
  }, [name, selectedColor, createProject, onClose])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCreate()
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [handleCreate, onClose]
  )

  return (
    <div className="mx-2 mb-2 p-2.5 rounded-lg border border-border bg-background/80 backdrop-blur-sm">
      <input
        ref={inputRef}
        className="w-full text-sm bg-transparent border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-primary placeholder:text-muted-foreground/50"
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {/* Color picker */}
      <div className="flex items-center gap-1.5 mt-2.5">
        {PROJECT_COLOR_NAMES.map((color) => (
          <button
            key={color}
            className={`size-5 rounded-full transition-all duration-150 ${getProjectColorClass(color)} ${
              selectedColor === color
                ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110'
                : 'hover:scale-110 opacity-70 hover:opacity-100'
            }`}
            onClick={() => setSelectedColor(color)}
            title={color}
            type="button"
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-1.5 mt-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleCreate}
          disabled={!name.trim()}
        >
          Create
        </Button>
      </div>
    </div>
  )
}
