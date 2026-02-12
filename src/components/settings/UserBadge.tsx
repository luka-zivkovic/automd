import { useState, useRef, useEffect } from 'react'
import { useUserStore } from '@/store/user-store'
import { User } from 'lucide-react'

export function UserBadge() {
  const username = useUserStore((s) => s.username)
  const setUsername = useUserStore((s) => s.setUsername)
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState(username)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  function handleSave() {
    setUsername(value)
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setValue(username)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder="Your name"
        className="text-xs bg-background border border-input rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-ring/30 w-24"
      />
    )
  }

  return (
    <button
      onClick={() => {
        setValue(username)
        setIsEditing(true)
      }}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/40"
    >
      <User className="size-3.5" />
      <span>{username || 'Set name'}</span>
    </button>
  )
}
