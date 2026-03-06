import { useState, useRef, useMemo } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { extractFrontmatter } from '@automd/shared'
import { renderMdast } from '@/lib/markdown/mdast-renderer'
import { FilterBar } from '@/components/search/FilterBar'
import { FileText, Code2, X, Plus, Tag } from 'lucide-react'

function SplitEditorToggle() {
  const showSplitEditor = useUiStore((s) => s.showSplitEditor)
  const toggleSplitEditor = useUiStore((s) => s.toggleSplitEditor)

  return (
    <button
      onClick={toggleSplitEditor}
      title={showSplitEditor ? 'Hide markdown editor' : 'Show markdown editor'}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/40 whitespace-nowrap"
    >
      {showSplitEditor ? <X className="size-3.5" /> : <Code2 className="size-3.5" />}
      <span className="hidden sm:inline">{showSplitEditor ? 'Hide editor' : 'Editor'}</span>
    </button>
  )
}

function TagBar() {
  const ast = useDocumentStore((s) => s.ast)
  const updateFrontmatterTags = useDocumentStore((s) => s.updateFrontmatterTags)
  const [isAdding, setIsAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const tags = useMemo(() => {
    if (!ast) return []
    const meta = extractFrontmatter(ast)
    return Array.isArray(meta?.tags) ? meta.tags : []
  }, [ast])

  function handleAdd() {
    const trimmed = newTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (trimmed && !tags.includes(trimmed)) {
      updateFrontmatterTags([...tags, trimmed])
    }
    setNewTag('')
    setIsAdding(false)
  }

  function handleRemove(tag: string) {
    updateFrontmatterTags(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex items-center gap-1.5 px-8 py-2 max-w-3xl mx-auto w-full">
      <Tag className="size-3.5 text-muted-foreground/60 shrink-0" />
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border bg-accent/30 text-muted-foreground group"
        >
          #{tag}
          <button
            onClick={() => handleRemove(tag)}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      {isAdding ? (
        <input
          ref={inputRef}
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
            if (e.key === 'Escape') { setIsAdding(false); setNewTag('') }
          }}
          onBlur={handleAdd}
          placeholder="tag name"
          className="text-[11px] w-20 bg-transparent border-b border-border outline-none focus:border-primary py-0.5 text-muted-foreground"
          autoFocus
        />
      ) : (
        <button
          onClick={() => {
            setIsAdding(true)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-0.5"
        >
          <Plus className="size-3" />
          {tags.length === 0 ? 'Add tags for AI discoverability' : 'Add tag'}
        </button>
      )}
    </div>
  )
}

export function DocumentPage() {
  const ast = useDocumentStore((s) => s.ast)
  const files = useFilesStore((s) => s.files)
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const isPage = files.find((f) => f.id === activeFileId)?.itemType === 'page'

  return (
    <div className="flex flex-col h-full">
      <FilterBar>
        <SplitEditorToggle />
      </FilterBar>
      {isPage && <TagBar />}

      {!ast || ast.children.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <FileText className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">Start writing</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Open the editor and write markdown. Headings, lists, code blocks, and more will render here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-8 py-10">
            {renderMdast(ast)}
          </div>
        </div>
      )}
    </div>
  )
}
