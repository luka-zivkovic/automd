import { useMemo, useState, useCallback } from 'react'
import { useFilesStore } from '@/store/files-store'
import { parseMarkdown } from '@/lib/markdown/parser'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, Search, Copy, Check, ExternalLink } from 'lucide-react'
import { useUiStore } from '@/store/ui-store'
import { HAS_SERVER, API_BASE } from '@/lib/api'
import { useAuthStore } from '@/store/auth-store'
import type { Task } from '@automd/shared'

interface KnowledgeEntry {
  task: Task
  boardId: string
  boardName: string
  type: 'knowledge' | 'learning'
}

export function MemoryView() {
  const files = useFilesStore((s) => s.files)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)

  // Extract all knowledge items and learnings across all boards
  const entries = useMemo(() => {
    const result: KnowledgeEntry[] = []

    for (const file of files) {
      if (!file.markdown) continue
      try {
        const ast = parseMarkdown(file.markdown)
        const cache = createIdCache()
        const annotated = annotateIds(ast, cache)
        const { tasks } = extractTasksAndColumns(annotated)

        for (const task of tasks) {
          // Knowledge items
          if (task.metadata.knowledge) {
            result.push({
              task,
              boardId: file.id,
              boardName: file.name,
              type: 'knowledge',
            })
          }
          // Tasks with learnings (even if not knowledge:true)
          if (task.learnings && !task.metadata.knowledge) {
            result.push({
              task,
              boardId: file.id,
              boardName: file.name,
              type: 'learning',
            })
          }
        }
      } catch {
        // Skip boards that fail to parse
      }
    }

    return result
  }, [files])

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase()
    return entries.filter((e) => {
      const text = [
        e.task.displayContent,
        e.task.description,
        e.task.learnings,
        e.boardName,
        ...e.task.metadata.labels,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes(q)
    })
  }, [entries, searchQuery])

  // Group by tags
  const tagGroups = useMemo(() => {
    const tags = new Map<string, KnowledgeEntry[]>()
    for (const entry of filtered) {
      for (const label of entry.task.metadata.labels) {
        const group = tags.get(label) ?? []
        group.push(entry)
        tags.set(label, group)
      }
    }
    return tags
  }, [filtered])

  const allTags = useMemo(() => [...tagGroups.keys()].sort(), [tagGroups])

  const handleCopyContext = useCallback(async () => {
    let contextText: string

    if (HAS_SERVER) {
      // Use the context API
      try {
        const token = useAuthStore.getState().token
        const params = new URLSearchParams()
        if (searchQuery.trim()) params.set('topic', searchQuery.trim())
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch(`${API_BASE}/context?${params}`, { headers })
        if (res.ok) {
          const data = await res.json()
          contextText = data.context
        } else {
          contextText = buildLocalContext(filtered)
        }
      } catch {
        contextText = buildLocalContext(filtered)
      }
    } else {
      contextText = buildLocalContext(filtered)
    }

    await navigator.clipboard.writeText(contextText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [filtered, searchQuery])

  const handleNavigateToTask = useCallback(
    (boardId: string, taskId: string) => {
      setActiveFile(boardId)
      setActiveView('editor')
      setSelectedTaskId(taskId)
    },
    [setActiveFile, setActiveView, setSelectedTaskId]
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Brain className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Memory</h1>
          <Badge variant="secondary" className="text-xs">
            {filtered.length} items
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleCopyContext}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy as context'}
        </Button>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
            placeholder="Search knowledge and learnings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Tag chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  searchQuery === tag
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
                onClick={() =>
                  setSearchQuery((q) => (q === tag ? '' : tag))
                }
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-3">
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Brain className="size-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {entries.length === 0
                  ? 'No knowledge items yet. Add knowledge:true to tasks or write ### Learnings sections.'
                  : 'No results match your search.'}
              </p>
            </div>
          )}

          {filtered.map((entry) => (
            <Card
              key={`${entry.boardId}-${entry.task.id}`}
              className="group cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => handleNavigateToTask(entry.boardId, entry.task.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-medium leading-snug">
                    {entry.task.displayContent}
                  </CardTitle>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors mt-0.5" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge
                    variant={entry.type === 'knowledge' ? 'default' : 'secondary'}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {entry.type}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {entry.boardName}
                  </span>
                  {entry.task.metadata.labels.map((label) => (
                    <span
                      key={label}
                      className="text-[10px] text-primary/70 bg-primary/5 px-1.5 py-0 rounded"
                    >
                      #{label}
                    </span>
                  ))}
                </div>
              </CardHeader>
              {(entry.task.description || entry.task.learnings) && (
                <CardContent className="pt-0">
                  {entry.task.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                      {entry.task.description}
                    </p>
                  )}
                  {entry.task.learnings && (
                    <div className="text-xs text-muted-foreground/80 bg-muted/50 rounded px-2.5 py-1.5 mt-1">
                      {entry.task.learnings.split('\n').slice(0, 3).map((line, i) => (
                        <div key={i} className="truncate">{line}</div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/** Build a paste-ready markdown context from local data */
function buildLocalContext(entries: KnowledgeEntry[]): string {
  const lines: string[] = ['## Knowledge from AutoMD', '']

  const knowledge = entries.filter((e) => e.type === 'knowledge')
  const learnings = entries.filter((e) => e.type === 'learning')

  if (knowledge.length > 0) {
    lines.push('### Knowledge Items', '')
    for (const e of knowledge) {
      lines.push(`- **${e.task.displayContent}** (${e.boardName})`)
      if (e.task.description) lines.push(`  ${e.task.description.split('\n')[0]}`)
      if (e.task.learnings) {
        for (const l of e.task.learnings.split('\n').filter(Boolean)) {
          lines.push(`  ${l}`)
        }
      }
    }
    lines.push('')
  }

  if (learnings.length > 0) {
    lines.push('### Learnings', '')
    for (const e of learnings) {
      lines.push(`- From "${e.task.displayContent}" (${e.boardName}):`)
      if (e.task.learnings) {
        for (const l of e.task.learnings.split('\n').filter(Boolean)) {
          lines.push(`  ${l}`)
        }
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
