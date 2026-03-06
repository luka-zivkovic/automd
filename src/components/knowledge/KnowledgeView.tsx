import { useState, useMemo, useRef, useCallback } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { useUiStore } from '@/store/ui-store'
import { useFilteredColumns } from '@/hooks/useFilteredColumns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SplitView } from '@/components/editor/SplitView'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { Brain, Search, Plus, Code2, X, ChevronDown, ChevronRight } from 'lucide-react'

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

function AddEntryInput({ columnId }: { columnId: string }) {
  const addTask = useDocumentStore((s) => s.addTask)
  const [isAdding, setIsAdding] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    const trimmed = value.trim()
    if (trimmed) {
      // Auto-append knowledge:true so entries are flagged for MCP
      const content = trimmed.includes('knowledge:true') ? trimmed : `${trimmed} knowledge:true`
      addTask(columnId, content)
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
        className="flex items-center gap-1.5 mt-2 px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/40 transition-colors duration-150 w-full"
      >
        <Plus className="size-3.5" />
        <span>Add entry</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!value.trim()) setIsAdding(false)
        }}
        placeholder="Entry title #tag1 #tag2"
        className="flex-1 text-sm bg-background border border-input rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground/50"
      />
      <Button size="sm" onClick={handleSubmit}>
        Add
      </Button>
    </div>
  )
}

function KnowledgeContent() {
  const columns = useDocumentStore((s) => s.columns)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set())

  const filteredColumns = useFilteredColumns(columns)

  // Flatten all tasks for tag extraction
  const allTasks = useMemo(
    () => filteredColumns.flatMap((c) => c.tasks),
    [filteredColumns]
  )

  // Collect all tags
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const task of allTasks) {
      for (const label of task.metadata.labels) {
        tags.add(label)
      }
    }
    return [...tags].sort()
  }, [allTasks])

  // Filter by search + tag
  const displayColumns = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return filteredColumns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((task) => {
        if (selectedTag && !task.metadata.labels.includes(selectedTag)) return false
        if (!q) return true
        const text = [
          task.displayContent,
          task.description,
          task.learnings,
          ...task.metadata.labels,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return text.includes(q)
      }),
    }))
  }, [filteredColumns, searchQuery, selectedTag])

  const totalEntries = displayColumns.reduce((sum, col) => sum + col.tasks.length, 0)

  const toggleCollapse = useCallback((colId: string) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(colId)) next.delete(colId)
      else next.add(colId)
      return next
    })
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-purple-500" />
          <h1 className="text-lg font-semibold">Knowledge Base</h1>
          <Badge variant="secondary" className="text-xs">
            {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
          </Badge>
        </div>
        <SplitEditorToggle />
      </div>

      {/* Search + tags */}
      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
            placeholder="Search entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  selectedTag === tag
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                onClick={() => setSelectedTag((t) => (t === tag ? null : tag))}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Card grid grouped by column */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-6 flex flex-col gap-6">
          {displayColumns.map((col) => (
            <div key={col.id}>
              {/* Column header */}
              <button
                className="flex items-center gap-1.5 mb-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleCollapse(col.id)}
              >
                {collapsedColumns.has(col.id) ? (
                  <ChevronRight className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
                {col.title}
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-1">
                  {col.tasks.length}
                </Badge>
              </button>

              {!collapsedColumns.has(col.id) && (
                <>
                  {col.tasks.length === 0 && !searchQuery && !selectedTag && (
                    <p className="text-xs text-muted-foreground/60 ml-5 mb-2">
                      No entries yet
                    </p>
                  )}

                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                    {col.tasks.map((task) => (
                      <Card
                        key={task.id}
                        className="group cursor-pointer hover:border-primary/30 transition-colors"
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium leading-snug">
                            {task.displayContent}
                          </CardTitle>
                          {task.metadata.labels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {task.metadata.labels.map((label) => (
                                <span
                                  key={label}
                                  className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0 rounded"
                                >
                                  #{label}
                                </span>
                              ))}
                            </div>
                          )}
                        </CardHeader>
                        {(task.description || task.learnings) && (
                          <CardContent className="pt-0">
                            {task.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                                {task.description}
                              </p>
                            )}
                            {task.learnings && (
                              <div className="text-xs text-muted-foreground/80 bg-muted/50 rounded px-2.5 py-1.5 mt-1">
                                {task.learnings
                                  .split('\n')
                                  .slice(0, 3)
                                  .map((line, i) => (
                                    <div key={i} className="truncate">
                                      {line}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>

                  <AddEntryInput columnId={col.id} />
                </>
              )}
            </div>
          ))}

          {totalEntries === 0 && displayColumns.every((c) => c.tasks.length === 0) && (searchQuery || selectedTag) && (
            <div className="text-center py-12">
              <Brain className="size-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No entries match your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function KnowledgeView() {
  const showSplitEditor = useUiStore((s) => s.showSplitEditor)

  if (showSplitEditor) {
    return <SplitView left={<MarkdownEditor />} right={<KnowledgeContent />} />
  }

  return <KnowledgeContent />
}
