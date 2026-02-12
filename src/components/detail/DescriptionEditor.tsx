import { useState, useRef, useEffect, useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'

interface DescriptionEditorProps {
  taskId: string
  description: string | null
}

export function DescriptionEditor({ taskId, description }: DescriptionEditorProps) {
  const updateTaskDescription = useDocumentStore((s) => s.updateTaskDescription)
  const [value, setValue] = useState(description ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from props when task changes externally
  useEffect(() => {
    setValue(description ?? '')
  }, [description, taskId])

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value
    setValue(newValue)

    // Debounced save
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      const trimmed = newValue.trim()
      updateTaskDescription(taskId, trimmed.length > 0 ? trimmed : null)
    }, 500)
  }

  // Save immediately on blur
  function handleBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const trimmed = value.trim()
    updateTaskDescription(taskId, trimmed.length > 0 ? trimmed : null)
  }

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="Add a description..."
      rows={1}
      className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 leading-relaxed outline-none border border-transparent rounded-md px-2.5 py-2 -mx-2.5 transition-colors duration-150 hover:border-border/60 focus:border-ring focus:ring-2 focus:ring-ring/20"
    />
  )
}
