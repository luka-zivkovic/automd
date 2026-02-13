import { useState, useRef, useEffect, useCallback } from 'react'
import { MoreHorizontal, Pencil, Trash2, ArrowLeft, ArrowRight } from 'lucide-react'
import type { Column } from '@/lib/markdown/types'
import { useDocumentStore } from '@/store/document-store'

interface ColumnHeaderProps {
  column: Column
  columnIndex: number
  totalColumns: number
}

export function ColumnHeader({ column, columnIndex, totalColumns }: ColumnHeaderProps) {
  const renameColumn = useDocumentStore((s) => s.renameColumn)
  const deleteColumn = useDocumentStore((s) => s.deleteColumn)
  const moveColumn = useDocumentStore((s) => s.moveColumn)

  const [menuOpen, setMenuOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(column.title)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const completed = column.tasks.filter((t) => t.checked).length
  const total = column.tasks.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  const canMoveLeft = columnIndex > 0
  const canMoveRight = columnIndex < totalColumns - 1

  // Close menu on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (
      menuRef.current &&
      !menuRef.current.contains(e.target as Node) &&
      menuButtonRef.current &&
      !menuButtonRef.current.contains(e.target as Node)
    ) {
      setMenuOpen(false)
      setShowDeleteConfirm(false)
    }
  }, [])

  useEffect(() => {
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen, handleClickOutside])

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== column.title) {
      renameColumn(column.id, trimmed)
    }
    setIsRenaming(false)
    setRenameValue(column.title)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
      setRenameValue(column.title)
    }
  }

  function handleDelete() {
    deleteColumn(column.id)
    setMenuOpen(false)
    setShowDeleteConfirm(false)
  }

  function handleMoveLeft() {
    if (canMoveLeft) {
      moveColumn(column.id, columnIndex - 1)
      setMenuOpen(false)
    }
  }

  function handleMoveRight() {
    if (canMoveRight) {
      moveColumn(column.id, columnIndex + 1)
      setMenuOpen(false)
    }
  }

  return (
    <div className="px-3.5 py-3 border-b border-border/60">
      <div className="flex items-center justify-between">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRenameSubmit}
            className="font-display text-base text-foreground italic bg-transparent border-b border-primary/50 outline-none flex-1 mr-2 py-0"
          />
        ) : (
          <h3 className="font-display text-base text-foreground italic">
            {column.title}
          </h3>
        )}

        <div className="flex items-center gap-1">
          <span className="text-xs tabular-nums font-medium text-muted-foreground bg-secondary rounded-full px-2 py-0.5">
            {total}
          </span>

          <div className="relative">
            <button
              ref={menuButtonRef}
              onClick={() => {
                setMenuOpen(!menuOpen)
                setShowDeleteConfirm(false)
              }}
              className="p-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/80 transition-colors"
            >
              <MoreHorizontal className="size-4" />
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden"
              >
                {showDeleteConfirm ? (
                  <div className="px-3 py-2">
                    <p className="text-xs text-muted-foreground mb-2">
                      Delete column and all tasks?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        className="flex-1 px-2 py-1 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false)
                        setRenameValue(column.title)
                        setIsRenaming(true)
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-secondary/80 transition-colors"
                    >
                      <Pencil className="size-3.5" />
                      Rename
                    </button>

                    {canMoveLeft && (
                      <button
                        onClick={handleMoveLeft}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <ArrowLeft className="size-3.5" />
                        Move left
                      </button>
                    )}

                    {canMoveRight && (
                      <button
                        onClick={handleMoveRight}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-foreground hover:bg-secondary/80 transition-colors"
                      >
                        <ArrowRight className="size-3.5" />
                        Move right
                      </button>
                    )}

                    <div className="my-1 border-t border-border/60" />

                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {percent}%
          </span>
        </div>
      )}
    </div>
  )
}
