import { useState, useMemo } from 'react'
import { useMemoryData, type MemoryEntry } from '@/hooks/useMemoryData'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Brain,
  Search,
  BookOpen,
  Lightbulb,
  FileText,
  ChevronRight,
  X,
  Filter,
} from 'lucide-react'

const TYPE_CONFIG = {
  knowledge: {
    label: 'Knowledge',
    icon: BookOpen,
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
    badge: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  },
  learning: {
    label: 'Learning',
    icon: Lightbulb,
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  context: {
    label: 'Context',
    icon: FileText,
    color: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
} as const

export function MemoryView() {
  const { entries, allTags, allBoards, allProjects } = useMemoryData()
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let result = entries

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.learnings?.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    if (selectedTags.size > 0) {
      result = result.filter((e) => e.tags.some((t) => selectedTags.has(t)))
    }

    if (selectedProject) {
      result = result.filter((e) => e.projectName === selectedProject)
    }

    if (selectedBoard) {
      result = result.filter((e) => e.boardName === selectedBoard)
    }

    if (selectedType) {
      result = result.filter((e) => e.type === selectedType)
    }

    return result
  }, [entries, search, selectedTags, selectedProject, selectedBoard, selectedType])

  const hasFilters = selectedTags.size > 0 || selectedProject || selectedBoard || selectedType

  function clearFilters() {
    setSelectedTags(new Set())
    setSelectedProject(null)
    setSelectedBoard(null)
    setSelectedType(null)
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <Brain className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">
              No knowledge captured yet
            </h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Use the MCP tools to add knowledge notes, or add{' '}
              <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono">
                knowledge:true
              </code>{' '}
              to any task. Learnings and descriptions from your boards will also appear here.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Hero */}
          <div className="mb-8">
            <div className="flex items-end justify-between mb-1">
              <div>
                <h2 className="font-display text-3xl text-foreground italic">Memory</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {entries.length} entries across {allBoards.length} board
                  {allBoards.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(['knowledge', 'learning', 'context'] as const).map((type) => {
                  const count = entries.filter((e) => e.type === type).length
                  if (count === 0) return null
                  const cfg = TYPE_CONFIG[type]
                  return (
                    <Badge
                      key={type}
                      variant="outline"
                      className={cn('text-[10px] px-2 py-0.5 h-5 cursor-pointer', cfg.badge,
                        selectedType === type && 'ring-1 ring-ring'
                      )}
                      onClick={() => setSelectedType(selectedType === type ? null : type)}
                    >
                      {count} {cfg.label}
                    </Badge>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="mb-6 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search knowledge, learnings, descriptions..."
                className="w-full pl-9 h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Tag + Board filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Filter className="size-3 text-muted-foreground/50" />

              {/* Project filter */}
              {allProjects.length > 1 && (
                <select
                  value={selectedProject ?? ''}
                  onChange={(e) => setSelectedProject(e.target.value || null)}
                  className="text-[11px] h-6 rounded-md border border-border bg-background px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">All projects</option>
                  {allProjects.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}

              {/* Board filter */}
              {allBoards.length > 1 && (
                <select
                  value={selectedBoard ?? ''}
                  onChange={(e) => setSelectedBoard(e.target.value || null)}
                  className="text-[11px] h-6 rounded-md border border-border bg-background px-2 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">All boards</option>
                  {allBoards.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              )}

              {/* Tag chips */}
              {allTags.slice(0, 20).map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                    selectedTags.has(tag)
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'text-muted-foreground border-border hover:border-primary/30 hover:text-foreground'
                  )}
                >
                  #{tag}
                </button>
              ))}

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] px-2 py-0.5 text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Results count */}
          {(search || hasFilters) && (
            <p className="text-xs text-muted-foreground mb-4">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              {search && <> for &ldquo;{search}&rdquo;</>}
            </p>
          )}

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-enter">
            {filtered.map((entry) => (
              <MemoryCard key={entry.id} entry={entry} />
            ))}
          </div>

          {filtered.length === 0 && (search || hasFilters) && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">
                No entries match your filters.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MemoryCard({ entry }: { entry: MemoryEntry }) {
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  const cfg = TYPE_CONFIG[entry.type]
  const Icon = cfg.icon

  function handleClick() {
    setActiveFile(entry.boardId)
    setActiveView('checklist')
    setTimeout(() => setSelectedTaskId(entry.taskId), 50)
  }

  return (
    <button onClick={handleClick} className="text-left group">
      <Card className="py-0 gap-0 card-hover transition-all h-full">
        <div className="p-4 pb-3">
          {/* Source breadcrumb */}
          <div className="flex items-center gap-1.5 mb-2">
            {entry.projectName && (
              <>
                <span className="text-[11px] text-muted-foreground truncate">
                  {entry.projectName}
                </span>
                <ChevronRight className="size-2.5 text-muted-foreground/40 shrink-0" />
              </>
            )}
            <span className="text-[11px] text-muted-foreground truncate">
              {entry.boardName}
            </span>
          </div>

          {/* Title */}
          <div className="flex items-start gap-2">
            <div
              className={cn(
                'size-6 rounded-md flex items-center justify-center shrink-0 mt-0.5',
                cfg.color
              )}
            >
              <Icon className="size-3" />
            </div>
            <p className="text-sm font-medium text-foreground line-clamp-2">{entry.title}</p>
          </div>

          {/* Description preview */}
          {entry.description && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
              {entry.description}
            </p>
          )}

          {/* Learnings preview */}
          {entry.learnings && (
            <div className="mt-2 pl-2 border-l-2 border-amber-500/30">
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {entry.learnings}
              </p>
            </div>
          )}
        </div>

        {/* Footer: tags + type badge */}
        <div className="px-4 pb-3 pt-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {entry.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0 rounded-full bg-secondary text-muted-foreground shrink-0"
              >
                #{tag}
              </span>
            ))}
            {entry.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground/50 shrink-0">
                +{entry.tags.length - 3}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5', cfg.badge)}>
              {cfg.label}
            </Badge>
            <ChevronRight className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
          </div>
        </div>
      </Card>
    </button>
  )
}
