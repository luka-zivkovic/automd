import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Search, Copy, Check, X, ChevronRight, ChevronDown, Zap } from 'lucide-react'
import { useUiStore } from '@/store/ui-store'
import { useFilesStore } from '@/store/files-store'
import { useActivityStore } from '@/store/activity-store'
import { PROMPT_CATALOG, PROMPT_CATEGORIES } from '@/lib/prompts'
import type { PromptDefinition, PlaceholderDef } from '@/lib/prompts'

const CATEGORY_ORDER = ['system', 'workflow', 'planning', 'operations'] as const

const CATEGORY_COLORS: Record<string, string> = {
  system: 'bg-blue-500/15 text-blue-400',
  workflow: 'bg-emerald-500/15 text-emerald-400',
  planning: 'bg-amber-500/15 text-amber-400',
  operations: 'bg-purple-500/15 text-purple-400',
}

/** Resolve all placeholder tokens in prompt text */
function resolvePromptText(text: string, values: Record<string, string>): string {
  let result = text
  for (const [token, value] of Object.entries(values)) {
    if (value) result = result.replaceAll(`[${token}]`, value)
  }
  return result
}

/** Render prompt text with resolved (green) and unresolved (amber) tokens */
function renderPromptText(text: string, resolvedValues: Record<string, string>) {
  // First pass: replace resolved tokens with sentinel markers
  let processed = text
  const resolvedMarkers: { marker: string; value: string }[] = []
  for (const [token, value] of Object.entries(resolvedValues)) {
    if (value) {
      const marker = `\x00RESOLVED_${resolvedMarkers.length}\x00`
      resolvedMarkers.push({ marker, value })
      processed = processed.replaceAll(`[${token}]`, marker)
    }
  }

  // Split on both resolved markers and remaining unresolved [PLACEHOLDER] tokens
  const markerPattern = resolvedMarkers.map((m) => m.marker.replace(/\x00/g, '\\x00')).join('|')
  const unresolvedPattern = '(\\[[A-Z][A-Z0-9 _/-]*\\])'
  const combinedPattern = markerPattern
    ? `(${markerPattern})|${unresolvedPattern}`
    : unresolvedPattern
  const regex = new RegExp(combinedPattern, 'g')

  const parts: { text: string; type: 'text' | 'resolved' | 'unresolved' }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: processed.slice(lastIndex, match.index), type: 'text' })
    }
    const matched = match[0]
    const resolved = resolvedMarkers.find((m) => m.marker === matched)
    if (resolved) {
      parts.push({ text: resolved.value, type: 'resolved' })
    } else {
      parts.push({ text: matched, type: 'unresolved' })
    }
    lastIndex = match.index + matched.length
  }
  if (lastIndex < processed.length) {
    parts.push({ text: processed.slice(lastIndex), type: 'text' })
  }

  return parts.map((part, i) => {
    if (part.type === 'resolved') {
      return (
        <span key={i} className="text-emerald-400 bg-emerald-500/10 px-0.5 rounded font-semibold">
          {part.text}
        </span>
      )
    }
    if (part.type === 'unresolved') {
      return (
        <span key={i} className="text-amber-400 bg-amber-500/10 px-0.5 rounded">
          {part.text}
        </span>
      )
    }
    return <span key={i}>{part.text}</span>
  })
}

/** Check resolution status of a prompt */
function getResolutionStatus(
  prompt: PromptDefinition,
  resolvedBoardName: string | null,
  inputValues: Record<string, string>
): 'ready' | 'needs-input' | 'none' {
  if (prompt.placeholders.length === 0) return 'none'
  for (const ph of prompt.placeholders) {
    if (ph.type === 'board' && !resolvedBoardName) return 'needs-input'
    if (ph.type === 'input' && !inputValues[`${prompt.id}:${ph.token}`]?.trim()) return 'needs-input'
  }
  return 'ready'
}

export function PromptsLibrary() {
  const open = useUiStore((s) => s.promptsLibraryOpen)
  const setOpen = useUiStore((s) => s.setPromptsLibraryOpen)

  const activeFileId = useFilesStore((s) => s.activeFileId)
  const files = useFilesStore((s) => s.files)
  const activeFile = files.find((f) => f.id === activeFileId)
  const autoBoardName = activeFile?.name ?? null

  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Board resolution: prefer active file, fall back to manual selection
  const selectedBoard = selectedBoardId ? files.find((f) => f.id === selectedBoardId) : null
  const resolvedBoardName = autoBoardName ?? selectedBoard?.name ?? null

  // Board options for the picker (exclude notes)
  const boardOptions = useMemo(
    () => files.filter((f) => f.itemType !== 'note'),
    [files]
  )

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setExpandedId(null)
  }, [setOpen])

  useEffect(() => {
    if (open) {
      setQuery('')
      setExpandedId(null)
      setCopiedId(null)
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

  function getResolvedValues(prompt: PromptDefinition): Record<string, string> {
    const values: Record<string, string> = {}
    for (const ph of prompt.placeholders) {
      if (ph.type === 'board' && resolvedBoardName) {
        values[ph.token] = resolvedBoardName
      } else if (ph.type === 'input') {
        const val = inputValues[`${prompt.id}:${ph.token}`]
        if (val?.trim()) values[ph.token] = val.trim()
      }
    }
    return values
  }

  function handleCopy(e: React.MouseEvent, prompt: PromptDefinition) {
    e.stopPropagation()
    const values = getResolvedValues(prompt)
    const resolved = resolvePromptText(prompt.prompt, values)
    navigator.clipboard.writeText(resolved)
    setCopiedId(prompt.id)
    setTimeout(() => setCopiedId(null), 2000)

    // Launch workflow tracking
    useActivityStore.getState().addEvent({
      type: 'workflow:launched',
      description: `Workflow launched: ${prompt.name}`,
      actor: 'you',
      timestamp: Date.now(),
    })
    useActivityStore.getState().setOpen(true)
  }

  function handleInputChange(promptId: string, token: string, value: string) {
    setInputValues((prev) => ({ ...prev, [`${promptId}:${token}`]: value }))
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
          <Zap className="size-4 text-primary shrink-0" />
          <h2 className="text-sm font-semibold text-foreground">AI Workflows</h2>
          {resolvedBoardName ? (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
              {resolvedBoardName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              Select a board for context
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={close}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Board picker (only when no active board) */}
        {!autoBoardName && boardOptions.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20">
            <span className="text-xs text-muted-foreground shrink-0">Board context:</span>
            <select
              value={selectedBoardId ?? ''}
              onChange={(e) => setSelectedBoardId(e.target.value || null)}
              className="flex-1 text-xs bg-transparent border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">None (prompts will have placeholders)</option>
              {boardOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        {/* Prompt list */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No workflows match your search
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
                    const status = getResolutionStatus(prompt, resolvedBoardName, inputValues)
                    const resolvedValues = getResolvedValues(prompt)

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
                          {/* Status dot */}
                          <span className="shrink-0 flex items-center gap-1.5">
                            {status === 'ready' && (
                              <span className="size-1.5 rounded-full bg-emerald-400" />
                            )}
                            {status === 'needs-input' && (
                              <span className="size-1.5 rounded-full bg-amber-400" />
                            )}
                            {isExpanded ? (
                              <ChevronDown className="size-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3.5 text-muted-foreground" />
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
                            onClick={(e) => handleCopy(e, prompt)}
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

                        {/* Expanded: input fields + preview */}
                        {isExpanded && (
                          <div className="px-2.5 pb-2.5 pl-8">
                            {/* Input fields for user-provided placeholders */}
                            <PromptInputFields
                              prompt={prompt}
                              inputValues={inputValues}
                              onInputChange={handleInputChange}
                              resolvedBoardName={resolvedBoardName}
                            />

                            {/* Prompt preview */}
                            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                              {renderPromptText(prompt.prompt, resolvedValues)}
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
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Copy a workflow prompt and paste into your AI chat with AutoMD connected via MCP.</span>
          <kbd className="text-[9px] px-1.5 py-0.5 rounded border border-border bg-muted font-mono">
            Ctrl+Shift+P
          </kbd>
        </div>
      </div>
    </div>
  )
}

/** Render inline input fields for a prompt's user-input placeholders */
function PromptInputFields({
  prompt,
  inputValues,
  onInputChange,
  resolvedBoardName,
}: {
  prompt: PromptDefinition
  inputValues: Record<string, string>
  onInputChange: (promptId: string, token: string, value: string) => void
  resolvedBoardName: string | null
}) {
  const userInputs = prompt.placeholders.filter((p) => p.type === 'input')
  const hasBoardPlaceholder = prompt.placeholders.some((p) => p.type === 'board')

  if (!hasBoardPlaceholder && userInputs.length === 0) return null

  return (
    <div className="mb-2 space-y-2">
      {/* Board context indicator */}
      {hasBoardPlaceholder && resolvedBoardName && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Board:</span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-medium">
            {resolvedBoardName}
          </span>
          <span className="text-muted-foreground/50">auto-detected</span>
        </div>
      )}
      {hasBoardPlaceholder && !resolvedBoardName && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-400">No board selected</span>
          <span className="text-muted-foreground/50">— select one above or prompt will have [BOARD NAME] placeholder</span>
        </div>
      )}

      {/* User input fields */}
      {userInputs.map((ph) => (
        <div key={ph.token}>
          <label className="text-[11px] text-muted-foreground mb-1 block">{ph.label}</label>
          {ph.multiline ? (
            <textarea
              value={inputValues[`${prompt.id}:${ph.token}`] ?? ''}
              onChange={(e) => onInputChange(prompt.id, ph.token, e.target.value)}
              placeholder={ph.label + '...'}
              rows={3}
              className="w-full text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          ) : (
            <input
              type="text"
              value={inputValues[`${prompt.id}:${ph.token}`] ?? ''}
              onChange={(e) => onInputChange(prompt.id, ph.token, e.target.value)}
              placeholder={ph.label + '...'}
              className="w-full text-xs bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      ))}
    </div>
  )
}
