import { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Plug,
  Copy,
  Check,
  Plus,
  KeyRound,
  Terminal,
  Monitor,
  MousePointer,
  Wind,
  MessageSquare,
  Code,
  AlertCircle,
  ChevronRight,
  CheckSquare,
  Brain,
  Users,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch, HAS_SERVER } from '@/lib/api'
import { WebhooksSection } from './WebhooksSection'
import { useUserStore } from '@/store/user-store'
import {
  USE_CASES,
  TOOL_GUIDES,
  getSystemPrompt,
  getMcpConfig,
  getRestApiExample,
  type UseCase,
  type ToolGuide,
} from './tool-guides'

// ── Icon map ─────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Terminal,
  Monitor,
  MousePointer,
  Wind,
  MessageSquare,
  Code,
}

const USE_CASE_ICONS: Record<UseCase, LucideIcon> = {
  'task-manager': CheckSquare,
  'knowledge-base': Brain,
  'team': Users,
  'all-in-one': Layers,
}

// ── API Key section ──────────────────────────────────────────────────

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAt: number
}

function ServerInfoCard({
  serverUrl,
  apiKey,
  onKeyGenerated,
}: {
  serverUrl: string
  apiKey: string | null
  onKeyGenerated: (key: string) => void
}) {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState<'url' | 'key' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!HAS_SERVER) return
    setLoading(true)
    apiFetch<ApiKey[]>('/auth/api-keys').then((result) => {
      if (result.ok) setKeys(result.data)
      setLoading(false)
    })
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    const result = await apiFetch<ApiKey & { fullKey: string }>('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'MCP Integration' }),
    })
    if (result.ok) {
      onKeyGenerated(result.data.fullKey)
      setKeys((prev) => [...prev, result.data])
    } else {
      setError(result.error)
    }
    setGenerating(false)
  }

  function handleCopy(value: string, type: 'url' | 'key') {
    navigator.clipboard.writeText(value)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="px-5 py-0">
        <CardTitle className="font-display text-base italic font-normal">Your Server</CardTitle>
      </CardHeader>
      <CardContent className="px-5 space-y-3">
        {/* Server URL */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            Server URL
          </label>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 text-sm bg-muted/50 px-3 py-1.5 rounded-md border border-border font-mono truncate">
              {serverUrl}
            </code>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleCopy(serverUrl, 'url')}
            >
              {copied === 'url' ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>

        {/* API Key */}
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
            API Key
          </label>
          {apiKey ? (
            <div className="mt-1 p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1.5">
                Copy this key now — it won't be shown again.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border border-border font-mono truncate select-all">
                  {apiKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleCopy(apiKey, 'key')}
                >
                  {copied === 'key' ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="mt-1 text-xs text-muted-foreground">Loading keys...</div>
          ) : keys.length > 0 ? (
            <div className="mt-1 flex items-center gap-2">
              <code className="text-sm bg-muted/50 px-3 py-1.5 rounded-md border border-border font-mono">
                {keys[0].keyPrefix}...
              </code>
              <span className="text-xs text-muted-foreground">
                Use your existing key, or generate a new one.
              </span>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                <Plus className="size-3" />
                New
              </Button>
            </div>
          ) : (
            <div className="mt-1">
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                <KeyRound className="size-3.5" />
                {generating ? 'Generating...' : 'Generate Key'}
              </Button>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive mt-2">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Copyable Code Block ──────────────────────────────────────────────

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group">
      {label && (
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      )}
      <div className="bg-muted/50 rounded-md border border-border overflow-hidden">
        <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-foreground/80 leading-relaxed overflow-x-auto">
          {code}
        </pre>
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 h-7 gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
          onClick={handleCopy}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

// ── Tool Guide Detail ────────────────────────────────────────────────

function ToolGuideDetail({
  tool,
  useCase,
  serverUrl,
  apiKey,
  username,
}: {
  tool: ToolGuide
  useCase: UseCase
  serverUrl: string
  apiKey: string | null
  username: string
}) {
  const replacements = { serverUrl, apiKey: apiKey || undefined, username: username || undefined }
  const systemPrompt = getSystemPrompt(useCase, tool.hasMcp, replacements)
  const mcpConfig = tool.hasMcp ? getMcpConfig(tool, replacements) : null
  const restExample = !tool.hasMcp ? getRestApiExample(replacements) : null

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="px-5 py-0">
        <div className="flex items-center gap-2">
          {(() => {
            const Icon = ICON_MAP[tool.icon] || Code
            return <Icon className="size-4 text-primary" />
          })()}
          <CardTitle className="font-display text-base italic font-normal">
            {tool.name} Setup
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-5 space-y-5">
        {tool.setupSteps.map((step, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
                {i + 1}
              </span>
              <h4 className="text-sm font-medium">{step.title}</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-2 ml-7">{step.description}</p>
            <div className="ml-7">
              {/* Step 1: MCP config or REST API example */}
              {i === 0 && mcpConfig && <CopyBlock code={mcpConfig} />}
              {i === 0 && restExample && <CopyBlock code={restExample} />}
              {/* Step 2: System prompt */}
              {i === 1 && <CopyBlock code={systemPrompt} />}
              {/* Step 3: Test */}
              {i === 2 && step.code && (
                <div className="bg-muted/50 rounded-md border border-border px-3 py-2">
                  <p className="text-sm font-mono text-foreground/80">{step.code}</p>
                </div>
              )}
            </div>
          </div>
        ))}

        {tool.promptFilePath && (
          <div className="ml-7 flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 border border-border/50">
            <ChevronRight className="size-3 shrink-0 mt-0.5" />
            <span>
              System prompt goes in: <code className="font-mono text-foreground/70">{tool.promptFilePath}</code>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main View ────────────────────────────────────────────────────────

export function ConnectView() {
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase>('all-in-one')
  const [selectedToolId, setSelectedToolId] = useState<string>('claude-code')
  const [apiKey, setApiKey] = useState<string | null>(null)
  const username = useUserStore((s) => s.username)
  const guideRef = useRef<HTMLDivElement>(null)

  const serverUrl = HAS_SERVER
    ? (import.meta.env.VITE_AUTOMD_SERVER || window.location.origin)
    : 'http://localhost:4800'

  const selectedTool = TOOL_GUIDES.find((t) => t.id === selectedToolId) ?? TOOL_GUIDES[0]

  const handleKeyGenerated = useCallback((key: string) => {
    setApiKey(key)
  }, [])

  function handleToolSelect(toolId: string) {
    setSelectedToolId(toolId)
    // Scroll guide into view
    setTimeout(() => guideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <Plug className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Connect Your AI Tools</h1>
          <p className="text-xs text-muted-foreground">
            Set up your AI to use AutoMD automatically for tasks and knowledge tracking
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">

          {/* Server Info */}
          <ServerInfoCard
            serverUrl={serverUrl}
            apiKey={apiKey}
            onKeyGenerated={handleKeyGenerated}
          />

          {/* Webhooks */}
          <WebhooksSection />

          {/* Use Case Picker */}
          <div>
            <h3 className="font-display text-sm italic text-muted-foreground mb-3">
              How will you use AutoMD?
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {USE_CASES.map((uc) => {
                const Icon = USE_CASE_ICONS[uc.id]
                const isSelected = selectedUseCase === uc.id
                return (
                  <button
                    key={uc.id}
                    className={`text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover:border-border/80 hover:bg-accent/30'
                    }`}
                    onClick={() => setSelectedUseCase(uc.id)}
                  >
                    <Icon className={`size-4 mb-1.5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="text-sm font-medium">{uc.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{uc.description}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tool Picker */}
          <div>
            <h3 className="font-display text-sm italic text-muted-foreground mb-3">
              Which AI tool do you use?
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {TOOL_GUIDES.map((tool) => {
                const Icon = ICON_MAP[tool.icon] || Code
                const isSelected = selectedToolId === tool.id
                return (
                  <button
                    key={tool.id}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                    onClick={() => handleToolSelect(tool.id)}
                  >
                    <Icon className="size-3" />
                    {tool.name}
                  </button>
                )
              })}
            </div>
            {!selectedTool.hasMcp && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                <AlertCircle className="size-3" />
                {selectedTool.name} doesn't support MCP — setup uses REST API + manual context pasting instead.
              </p>
            )}
          </div>

          {/* Tool Setup Guide */}
          <div ref={guideRef}>
            <ToolGuideDetail
              tool={selectedTool}
              useCase={selectedUseCase}
              serverUrl={serverUrl}
              apiKey={apiKey}
              username={username}
            />
          </div>

        </div>
      </div>
    </div>
  )
}
