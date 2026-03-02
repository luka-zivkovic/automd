import { useState, useMemo, useCallback } from 'react'
import { TEMPLATE_PROMPTS, type TemplatePrompt } from '@automd/shared'
import { useUiStore } from '@/store/ui-store'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BookOpen, Search, Copy, Check, ChevronRight } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  knowledge: 'Knowledge',
  planning: 'Planning',
  operations: 'Operations',
}

const CATEGORY_ORDER = ['getting-started', 'knowledge', 'planning', 'operations']

export function PromptsPopover() {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const setActiveView = useUiStore((s) => s.setActiveView)

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
          p.description.toLowerCase().includes(q)
      )
    }
    return items
  }, [searchQuery, filterCategory])

  const handleCopy = useCallback(async (prompt: TemplatePrompt, e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(prompt.prompt)
    setCopiedId(prompt.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handleViewAll = useCallback(() => {
    setOpen(false)
    setActiveView('prompts')
  }, [setActiveView])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant={open ? 'secondary' : 'ghost'}
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <BookOpen className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Prompts</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[360px] p-0 max-h-[420px] flex flex-col"
      >
        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
              placeholder="Search prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-1 mt-2 flex-wrap">
            <button
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
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
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
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

        {/* Prompt list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">No prompts match your search.</p>
            </div>
          )}

          {filtered.map((prompt) => {
            const isCopied = copiedId === prompt.id
            const isExpanded = expandedId === prompt.id
            return (
              <div key={prompt.id}>
                <button
                  className="w-full text-left flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-accent/50 transition-colors group"
                  onClick={() => setExpandedId(isExpanded ? null : prompt.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{prompt.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{prompt.description}</p>
                  </div>
                  <button
                    className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => handleCopy(prompt, e)}
                    title="Copy prompt"
                  >
                    {isCopied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </button>
                </button>

                {/* Expanded prompt content */}
                {isExpanded && (
                  <div className="mx-2.5 mb-2 p-2.5 bg-muted/50 rounded-md text-[11px] font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed max-h-[160px] overflow-y-auto">
                    {highlightPlaceholders(prompt.prompt)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border p-2">
          <button
            onClick={handleViewAll}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-md hover:bg-accent/50 transition-colors"
          >
            View all prompts
            <ChevronRight className="size-3" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

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
