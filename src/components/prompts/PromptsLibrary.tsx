import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, Copy, Check, BookOpen, X, ChevronRight, ChevronDown } from 'lucide-react'
import { useUiStore } from '@/store/ui-store'
import { PROMPT_CATALOG, PROMPT_CATEGORIES } from '@/lib/prompts'

const CATEGORY_ORDER = ['system', 'workflow', 'planning', 'operations'] as const

const CATEGORY_COLORS: Record<string, string> = {
  system: 'bg-blue-500/15 text-blue-400',
  workflow: 'bg-emerald-500/15 text-emerald-400',
  planning: 'bg-amber-500/15 text-amber-400',
  operations: 'bg-purple-500/15 text-purple-400',
}

/** Highlight [PLACEHOLDER] tokens in prompt text */
function renderPromptText(text: string) {
  const parts = text.split(/(\[[A-Z][A-Z0-9 _/-]*\])/g)
  return parts.map((part, i) =>
    /^\[[A-Z][A-Z0-9 _/-]*\]$/.test(part) ? (
      <span key={i} className="text-amber-400 bg-amber-500/10 px-0.5 rounded">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function PromptsLibrary() {
  const open = useUiStore((s) => s.promptsLibraryOpen)
  const setOpen = useUiStore((s) => s.setPromptsLibraryOpen)

  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setExpandedId(null)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setExpandedId(null)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return PROMPT_CATALOG
    return PROMPT_CATALOG.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q)
    )
  }, [query])

  const grouped = useMemo(() => {
    const groups: Record<string, typeof PROMPT_CATALOG> = {}
    for (const prompt of filtered) {
      if (!groups[prompt.category]) groups[prompt.category] = []
      groups[prompt.category].push(prompt)
    }
    return groups
  }, [filtered])

  function handleCopy(e: React.MouseEvent, promptText: string, id: string) {
    e.stopPropagation()
    navigator.clipboard.writeText(promptText)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="w-full max-w-2xl bg-popover border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <BookOpen className="size-4 text-primary shrink-0" />
          <h2 className="text-sm font-semibold text-foreground">Prompts</h2>
          <span className="text-xs text-muted-foreground">
            Copy & paste into your AI chat
          </span>
          <div className="flex-1" />
          <button
            onClick={close}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        {/* Prompt list */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No prompts match your search
            </div>
          )}

          {CATEGORY_ORDER.map((category) => {
            const prompts = grouped[category]
            if (!prompts?.length) return null
            const meta = PROMPT_CATEGORIES[category]

            return (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-2.5 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  {prompts.map((prompt) => {
                    const isExpanded = expandedId === prompt.id
                    const isCopied = copiedId === prompt.id

                    return (
                      <div key={prompt.id} className="rounded-lg hover:bg-accent/30 transition-colors">
                        {/* Row */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedId(isExpanded ? null : prompt.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setExpandedId(isExpanded ? null : prompt.id)
                            }
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-2 cursor-pointer"
                        >
                          <span className="text-muted-foreground shrink-0">
                            {isExpanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {prompt.name}
                              </span>
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${CATEGORY_COLORS[prompt.category] ?? ''}`}
                              >
                                {meta.label}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {prompt.description}
                            </p>
                          </div>
                          <button
                            onClick={(e) => handleCopy(e, prompt.prompt, prompt.id)}
                            className="shrink-0 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy prompt"
                          >
                            {isCopied ? (
                              <Check className="size-3.5 text-green-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Expanded preview */}
                        {isExpanded && (
                          <div className="px-2.5 pb-2.5 pl-8">
                            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                              {renderPromptText(prompt.prompt)}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          Copy a prompt and paste it into ChatGPT, Claude, or any AI chat with AutoMD connected via MCP.
        </div>
      </div>
    </div>
  )
}
