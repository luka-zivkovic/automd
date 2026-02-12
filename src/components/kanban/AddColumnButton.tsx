import { useState, useRef, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useDocumentStore } from '@/store/document-store'

export function AddColumnButton() {
  const addColumn = useDocumentStore((s) => s.addColumn)
  const [isExpanded, setIsExpanded] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isExpanded])

  function handleSubmit() {
    const trimmed = value.trim()
    if (trimmed) {
      addColumn(trimmed)
      setValue('')
      setIsExpanded(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      setValue('')
      setIsExpanded(false)
    }
  }

  function handleBlur() {
    // Small delay so clicking the Add button still works
    setTimeout(() => {
      if (!value.trim()) {
        setIsExpanded(false)
      }
    }, 150)
  }

  if (isExpanded) {
    return (
      <div className="flex flex-col w-[280px] min-w-[280px] rounded-xl border-2 border-dashed border-border/60 bg-card/50 p-3 gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="Column name..."
          className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            className="flex-1 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => {
              setValue('')
              setIsExpanded(false)
            }}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setIsExpanded(true)}
      className="flex flex-col items-center justify-center w-[280px] min-w-[280px] h-32 rounded-xl border-2 border-dashed border-border/40 bg-card/30 hover:border-border/60 hover:bg-card/50 transition-all duration-200 cursor-pointer group"
    >
      <Plus className="size-5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
      <span className="text-sm text-muted-foreground/50 group-hover:text-muted-foreground mt-1 transition-colors">
        Add column
      </span>
    </button>
  )
}
