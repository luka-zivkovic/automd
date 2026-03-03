import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Webhook,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import { apiFetch, HAS_SERVER } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────

interface WebhookStats {
  totalDelivered: number
  totalFailed: number
  lastDeliveredAt: string | null
  lastFailedAt: string | null
  lastStatusCode: number | null
}

interface WebhookEntry {
  id: string
  name: string
  url: string
  secret: string
  events: string[]
  enabled: boolean
  template?: 'slack' | 'discord'
  stats: WebhookStats
  createdAt: string
}

type Template = 'slack' | 'discord' | ''

const EVENT_GROUPS = [
  {
    label: 'Task Events',
    events: [
      'task.created',
      'task.completed',
      'task.uncompleted',
      'task.moved',
      'task.updated',
      'task.deleted',
    ],
  },
  {
    label: 'Board Events',
    events: ['board.created', 'board.updated', 'board.deleted'],
  },
  {
    label: 'Project Events',
    events: ['project.created', 'project.updated', 'project.deleted'],
  },
]

const ALL_EVENTS = EVENT_GROUPS.flatMap((g) => g.events)

// ── Create Form ───────────────────────────────────────────────────────

function CreateWebhookForm({
  onCreated,
  onCancel,
}: {
  onCreated: (wh: WebhookEntry, fullSecret: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([...ALL_EVENTS])
  const [template, setTemplate] = useState<Template>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleEvent(ev: string) {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]))
  }

  function toggleGroup(groupEvents: string[]) {
    const allSelected = groupEvents.every((e) => events.includes(e))
    if (allSelected) {
      setEvents((prev) => prev.filter((e) => !groupEvents.includes(e)))
    } else {
      setEvents((prev) => [...new Set([...prev, ...groupEvents])])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim() || events.length === 0) return

    setSubmitting(true)
    setError(null)

    const result = await apiFetch<WebhookEntry & { secret: string }>('/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        url: url.trim(),
        events,
        template: template || undefined,
      }),
    })

    if (result.ok) {
      onCreated(result.data, result.data.secret)
    } else {
      setError(result.error)
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Slack Notifications"
          className="mt-1 w-full text-sm bg-muted/50 px-3 py-1.5 rounded-md border border-border font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
          required
        />
      </div>

      {/* URL */}
      <div>
        <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
          Payload URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
          className="mt-1 w-full text-sm bg-muted/50 px-3 py-1.5 rounded-md border border-border font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
          required
        />
      </div>

      {/* Events */}
      <div>
        <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
          Events
        </label>
        <div className="mt-2 space-y-3">
          {EVENT_GROUPS.map((group) => {
            const allSelected = group.events.every((e) => events.includes(e))
            return (
              <div key={group.label}>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5 mb-1"
                  onClick={() => toggleGroup(group.events)}
                >
                  <span
                    className={`size-3 rounded border flex items-center justify-center text-[9px] ${
                      allSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border'
                    }`}
                  >
                    {allSelected && '✓'}
                  </span>
                  {group.label}
                </button>
                <div className="flex flex-wrap gap-1.5 ml-[18px]">
                  {group.events.map((ev) => {
                    const selected = events.includes(ev)
                    return (
                      <button
                        key={ev}
                        type="button"
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                          selected
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                        }`}
                        onClick={() => toggleEvent(ev)}
                      >
                        {ev}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Template */}
      <div>
        <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
          Format
        </label>
        <div className="flex gap-2 mt-1.5">
          {[
            { value: '', label: 'Raw JSON' },
            { value: 'slack', label: 'Slack' },
            { value: 'discord', label: 'Discord' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`text-xs px-3 py-1.5 rounded-md border transition-all cursor-pointer ${
                template === opt.value
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setTemplate(opt.value as Template)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={submitting || !name.trim() || !url.trim() || events.length === 0}>
          {submitting ? 'Creating...' : 'Create Webhook'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── Webhook Row ───────────────────────────────────────────────────────

function WebhookRow({
  webhook,
  newSecret,
  onToggle,
  onTest,
  onDelete,
  onRotateSecret,
}: {
  webhook: WebhookEntry
  newSecret: string | null
  onToggle: () => void
  onTest: () => void
  onDelete: () => void
  onRotateSecret: () => void
}) {
  const [expanded, setExpanded] = useState(!!newSecret)
  const [copied, setCopied] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; statusCode: number | null } | null>(null)

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    onTest()
    const result = await apiFetch<{ success: boolean; statusCode: number | null }>(`/webhooks/${webhook.id}/test`, {
      method: 'POST',
    })
    if (result.ok) {
      setTestResult(result.data)
    } else {
      setTestResult({ success: false, statusCode: null })
    }
    setTesting(false)
  }

  const urlDisplay = webhook.url.length > 50 ? webhook.url.slice(0, 50) + '...' : webhook.url

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className={`size-2 rounded-full shrink-0 ${webhook.enabled ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
          title={webhook.enabled ? 'Enabled' : 'Disabled'}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{webhook.name}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">{urlDisplay}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[10px] px-1.5">
            {webhook.events.length} events
          </Badge>
          {webhook.template && (
            <Badge variant="secondary" className="text-[10px] px-1.5 capitalize">
              {webhook.template}
            </Badge>
          )}
          {webhook.stats.totalDelivered > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {webhook.stats.totalDelivered} sent
            </span>
          )}
          {expanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20">
          {/* New secret display */}
          {newSecret && (
            <div className="p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1.5">
                Copy this signing secret now — it won't be shown again.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border border-border font-mono truncate select-all">
                  {newSecret}
                </code>
                <Button variant="ghost" size="icon-xs" onClick={() => handleCopy(newSecret)}>
                  {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* URL */}
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">URL</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <code className="text-xs font-mono text-foreground/80 break-all">{webhook.url}</code>
              <a href={webhook.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <ExternalLink className="size-3 text-muted-foreground hover:text-foreground" />
              </a>
            </div>
          </div>

          {/* Secret (redacted) */}
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Signing Secret</span>
            <div className="flex items-center gap-2 mt-0.5">
              <code className="text-xs font-mono text-muted-foreground">{webhook.secret}</code>
              <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={onRotateSecret}>
                <RefreshCw className="size-3" />
                Rotate
              </Button>
            </div>
          </div>

          {/* Events */}
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Events</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {webhook.events.map((ev) => (
                <Badge key={ev} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {ev}
                </Badge>
              ))}
            </div>
          </div>

          {/* Stats */}
          {(webhook.stats.totalDelivered > 0 || webhook.stats.totalFailed > 0) && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Delivery Stats</span>
              <div className="flex gap-4 mt-1 text-xs">
                <span className="text-green-600 dark:text-green-400">
                  {webhook.stats.totalDelivered} delivered
                </span>
                {webhook.stats.totalFailed > 0 && (
                  <span className="text-destructive">
                    {webhook.stats.totalFailed} failed
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-xs rounded-md px-2.5 py-1.5 ${
              testResult.success
                ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                : 'bg-destructive/10 text-destructive'
            }`}>
              {testResult.success ? (
                <><Check className="size-3" /> Test ping delivered (HTTP {testResult.statusCode})</>
              ) : (
                <><AlertCircle className="size-3" /> Test ping failed{testResult.statusCode ? ` (HTTP ${testResult.statusCode})` : ''}</>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleTest} disabled={testing}>
              <Zap className="size-3" />
              {testing ? 'Sending...' : 'Send Test'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onToggle}
            >
              {webhook.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="size-3" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Section ──────────────────────────────────────────────────────

export function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newSecrets, setNewSecrets] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const loadWebhooks = useCallback(async () => {
    const result = await apiFetch<WebhookEntry[]>('/webhooks')
    if (result.ok) {
      setWebhooks(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!HAS_SERVER) return
    loadWebhooks()
  }, [loadWebhooks])

  async function handleToggle(id: string, currentEnabled: boolean) {
    const result = await apiFetch<WebhookEntry>(`/webhooks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !currentEnabled }),
    })
    if (result.ok) {
      setWebhooks((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !currentEnabled } : w)))
    }
  }

  async function handleDelete(id: string) {
    const result = await apiFetch(`/webhooks/${id}`, { method: 'DELETE' })
    if (result.ok) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id))
      setNewSecrets((prev) => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
    }
  }

  async function handleRotateSecret(id: string) {
    const result = await apiFetch<{ secret: string }>(`/webhooks/${id}/rotate-secret`, {
      method: 'POST',
    })
    if (result.ok) {
      setNewSecrets((prev) => ({ ...prev, [id]: result.data.secret }))
    }
  }

  function handleCreated(wh: WebhookEntry, fullSecret: string) {
    setWebhooks((prev) => [...prev, wh])
    setNewSecrets((prev) => ({ ...prev, [wh.id]: fullSecret }))
    setShowCreate(false)
  }

  if (!HAS_SERVER) return null

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="px-5 py-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="size-4 text-primary" />
            <CardTitle className="font-display text-base italic font-normal">Webhooks</CardTitle>
          </div>
          {!showCreate && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="size-3" />
              Add Webhook
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Send real-time notifications to Slack, Discord, or any HTTP endpoint when tasks and boards change.
        </p>
      </CardHeader>
      <CardContent className="px-5 space-y-3">
        {loading ? (
          <div className="text-xs text-muted-foreground py-2">Loading webhooks...</div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {/* Create form */}
            {showCreate && (
              <div className="border border-primary/20 rounded-lg p-4 bg-primary/5">
                <CreateWebhookForm
                  onCreated={handleCreated}
                  onCancel={() => setShowCreate(false)}
                />
              </div>
            )}

            {/* Webhook list */}
            {webhooks.length > 0 ? (
              <div className="space-y-2">
                {webhooks.map((wh) => (
                  <WebhookRow
                    key={wh.id}
                    webhook={wh}
                    newSecret={newSecrets[wh.id] ?? null}
                    onToggle={() => handleToggle(wh.id, wh.enabled)}
                    onTest={() => {}} // test handled inside WebhookRow
                    onDelete={() => handleDelete(wh.id)}
                    onRotateSecret={() => handleRotateSecret(wh.id)}
                  />
                ))}
              </div>
            ) : !showCreate ? (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">
                  No webhooks configured yet.
                </p>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowCreate(true)}>
                  <Plus className="size-3" />
                  Create your first webhook
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
