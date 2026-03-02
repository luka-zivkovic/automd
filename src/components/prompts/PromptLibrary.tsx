import { useState, useMemo, useCallback } from 'react'
import { TEMPLATE_PROMPTS, type TemplatePrompt } from '@automd/shared'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BookOpen, Search, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  knowledge: 'Knowledge',
  planning: 'Planning',
  operations: 'Operations',
}

const CATEGORY_ORDER = ['getting-started', 'knowledge', 'planning', 'operations']

export function PromptLibrary() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let items = TEMPLATE_PROMPTS
    if (filterCategory) {
      items = items.filter((p) => p.category === filterCategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.prompt.toLowerCase().includes(q)
      )
    }
    return items
  }, [searchQuery, filterCategory])

  const grouped = useMemo(() => {
    const map = new Map<string, TemplatePrompt[]>()
    for (const prompt of filtered) {
      const group = map.get(prompt.category) ?? []
      group.push(prompt)
      map.set(prompt.category, group)
    }
    return map
  }, [filtered])

  const handleCopy = useCallback(async (prompt: TemplatePrompt) => {
    await navigator.clipboard.writeText(prompt.prompt)
    setCopiedId(prompt.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Prompt Library</h1>
          <Badge variant="secondary" className="text-xs">
            {filtered.length} prompts
          </Badge>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
            placeholder="Search prompts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-1.5 mt-2">
          <button
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              !filterCategory
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
            onClick={() => setFilterCategory(null)}
          >
            All
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                filterCategory === cat
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border text-muted-foreground hover:bg-accent'
              }`}
              onClick={() => setFilterCategory((c) => (c === cat ? null : cat))}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-6">
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="size-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No prompts match your search.</p>
            </div>
          )}

          {CATEGORY_ORDER.map((cat) => {
            const items = grouped.get(cat)
            if (!items || items.length === 0) return null
            return (
              <div key={cat}>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <div className="flex flex-col gap-2">
                  {items.map((prompt) => {
                    const isExpanded = expandedId === prompt.id
                    const isCopied = copiedId === prompt.id
                    return (
                      <Card
                        key={prompt.id}
                        className="overflow-hidden"
                      >
                        <CardHeader
                          className="pb-1 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : prompt.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {isExpanded ? (
                                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <CardTitle className="text-sm font-medium">{prompt.name}</CardTitle>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="shrink-0 gap-1.5 text-xs h-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopy(prompt)
                              }}
                            >
                              {isCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                              {isCopied ? 'Copied' : 'Copy'}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground ml-5.5">
                            {prompt.description}
                          </p>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="pt-2">
                            <div className="bg-muted/50 rounded-md p-3 text-xs font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed">
                              {highlightPlaceholders(prompt.prompt)}
                            </div>
                            {prompt.placeholders.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {prompt.placeholders.map((p) => (
                                  <span
                                    key={p.key}
                                    className="text-[10px] px-2 py-0.5 rounded bg-primary/5 text-primary/70 border border-primary/10"
                                    title={`${p.description} (e.g. ${p.example})`}
                                  >
                                    {`{{${p.key}}}`} — {p.description}
                                  </span>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

/** Highlight {{placeholders}} in prompt text */
function highlightPlaceholders(text: string): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/)
  return parts.map((part, i) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      return (
        <span key={i} className="text-primary font-semibold bg-primary/10 rounded px-0.5">
          {part}
        </span>
      )
    }
    return part
  })
}
