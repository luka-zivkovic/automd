import { useState, useRef } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface AddTaskInputProps {
  columnId: string
}

export function AddTaskInput({ columnId }: AddTaskInputProps) {
  const addTask = useDocumentStore((s) => s.addTask)
  const [isAdding, setIsAdding] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    const trimmed = value.trim()
    if (trimmed) {
      addTask(columnId, trimmed)
      setValue('')
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setValue('')
    }
  }

  if (!isAdding) {
    return (
      <button
        onClick={() => {
          setIsAdding(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="flex items-center gap-1.5 mt-3 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/40 transition-colors duration-150 w-full"
      >
        <Plus className="size-3.5" />
        <span>Add task</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!value.trim()) setIsAdding(false)
        }}
        placeholder="What needs to be done?"
        className="flex-1 text-sm bg-background border border-input rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground/50"
      />
      <Button size="sm" onClick={handleSubmit}>
        Add
      </Button>
    </div>
  )
}
