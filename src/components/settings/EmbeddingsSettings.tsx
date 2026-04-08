import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Brain, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { apiFetch, HAS_SERVER } from '@/lib/api'

type Provider = 'openai' | 'ollama' | null

interface EmbeddingsConfig {
  provider: Provider
  openai: { apiKey: string; baseUrl: string; model: string }
  ollama: { url: string; model: string }
}

interface SettingsResponse {
  settings: { embeddings: EmbeddingsConfig }
  effective: { embeddings: EmbeddingsConfig }
  envOverrides: Record<string, boolean>
}

export function EmbeddingsSettings() {
  const [config, setConfig] = useState<EmbeddingsConfig>({
    provider: null,
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
    ollama: { url: 'http://localhost:11434', model: 'nomic-embed-text' },
  })
  const [envOverrides, setEnvOverrides] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<{ enabled: boolean; provider?: string; indexedCount?: number }>({ enabled: false })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!HAS_SERVER) return
    const result = await apiFetch<SettingsResponse>('/settings')
    if (result.ok) {
      setConfig(result.data.settings.embeddings)
      setEnvOverrides(result.data.envOverrides)
      setLoaded(true)
    }

    // Also get status from health
    const health = await apiFetch<{ embeddings?: { enabled: boolean; provider?: string; indexedCount?: number } }>('/health')
    if (health.ok && health.data.embeddings) {
      setStatus(health.data.embeddings)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    setSaving(true)
    setSaveResult(null)
    const result = await apiFetch<SettingsResponse>('/settings', {
      method: 'PUT',
      body: JSON.stringify({ embeddings: config }),
    })
    setSaving(false)

    if (result.ok) {
      setConfig(result.data.settings.embeddings)
      setSaveResult({ ok: true, message: 'Settings saved' })
      // Refresh status
      const health = await apiFetch<{ embeddings?: { enabled: boolean; provider?: string; indexedCount?: number } }>('/health')
      if (health.ok && health.data.embeddings) {
        setStatus(health.data.embeddings)
      }
    } else {
      setSaveResult({ ok: false, message: result.error })
    }

    setTimeout(() => setSaveResult(null), 3000)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)

    // For test, we need to send the raw API key if it's been set
    const result = await apiFetch<{ ok: boolean; dimensions?: number; error?: string }>('/settings/test-connection', {
      method: 'POST',
      body: JSON.stringify(config),
    })

    setTesting(false)

    if (result.ok && result.data.ok) {
      setTestResult({ ok: true, message: `Connected! Vector dimensions: ${result.data.dimensions}` })
    } else {
      const error = result.ok ? result.data.error : result.error
      setTestResult({ ok: false, message: error || 'Connection failed' })
    }

    setTimeout(() => setTestResult(null), 5000)
  }

  if (!loaded) {
    return (
      <Card className="py-4 gap-3">
        <CardContent className="px-5 flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="px-5 py-0">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <CardTitle className="text-base font-medium">Embeddings</CardTitle>
          {status.enabled ? (
            <Badge variant="default" className="text-xs">Active</Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">Disabled</Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Enable semantic search for your knowledgebase. Requires an embedding provider (OpenAI or Ollama).
        </CardDescription>
      </CardHeader>

      <CardContent className="px-5 space-y-4">
        {/* Provider selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Provider
            {envOverrides.provider && (
              <span className="ml-1.5 text-amber-500">(overridden by env var)</span>
            )}
          </label>
          <div className="flex gap-2">
            {(['none', 'openai', 'ollama'] as const).map((p) => {
              const value = p === 'none' ? null : p
              const isActive = config.provider === value
              return (
                <button
                  key={p}
                  onClick={() => setConfig({ ...config, provider: value })}
                  disabled={envOverrides.provider}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    isActive
                      ? 'bg-primary/10 border-primary/30 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {p === 'none' ? 'None' : p === 'openai' ? 'OpenAI' : 'Ollama'}
                </button>
              )
            })}
          </div>
        </div>

        {/* OpenAI settings */}
        {config.provider === 'openai' && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <SettingsInput
              label="API Key"
              value={config.openai.apiKey}
              onChange={(v) => setConfig({ ...config, openai: { ...config.openai, apiKey: v } })}
              type="password"
              placeholder="sk-..."
              disabled={envOverrides.openaiApiKey}
              envOverride={envOverrides.openaiApiKey}
            />
            <SettingsInput
              label="Base URL"
              value={config.openai.baseUrl}
              onChange={(v) => setConfig({ ...config, openai: { ...config.openai, baseUrl: v } })}
              placeholder="https://api.openai.com/v1"
              disabled={envOverrides.openaiBaseUrl}
              envOverride={envOverrides.openaiBaseUrl}
            />
            <SettingsInput
              label="Model"
              value={config.openai.model}
              onChange={(v) => setConfig({ ...config, openai: { ...config.openai, model: v } })}
              placeholder="text-embedding-3-small"
              disabled={envOverrides.openaiModel}
              envOverride={envOverrides.openaiModel}
            />
          </div>
        )}

        {/* Ollama settings */}
        {config.provider === 'ollama' && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <SettingsInput
              label="Server URL"
              value={config.ollama.url}
              onChange={(v) => setConfig({ ...config, ollama: { ...config.ollama, url: v } })}
              placeholder="http://localhost:11434"
              disabled={envOverrides.ollamaUrl}
              envOverride={envOverrides.ollamaUrl}
            />
            <SettingsInput
              label="Model"
              value={config.ollama.model}
              onChange={(v) => setConfig({ ...config, ollama: { ...config.ollama, model: v } })}
              placeholder="nomic-embed-text"
              disabled={envOverrides.ollamaModel}
              envOverride={envOverrides.ollamaModel}
            />
          </div>
        )}

        {/* Status */}
        {status.enabled && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
            <CheckCircle className="size-3.5 text-green-500 shrink-0" />
            <span>
              Provider: <strong>{status.provider}</strong> — {status.indexedCount ?? 0} items indexed
            </span>
          </div>
        )}

        {/* Actions */}
        {config.provider && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing}
              className="gap-1.5"
            >
              {testing ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Test Connection
            </Button>

            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Save
            </Button>

            {testResult && (
              <span className={`text-xs flex items-center gap-1 ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {testResult.ok ? <CheckCircle className="size-3" /> : <XCircle className="size-3" />}
                {testResult.message}
              </span>
            )}

            {saveResult && (
              <span className={`text-xs flex items-center gap-1 ${saveResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                {saveResult.ok ? <CheckCircle className="size-3" /> : <XCircle className="size-3" />}
                {saveResult.message}
              </span>
            )}
          </div>
        )}

        {/* Env var hint */}
        {Object.values(envOverrides).some(Boolean) && (
          <div className="flex items-start gap-2 text-xs text-amber-600 rounded-md bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            <span>Some settings are overridden by environment variables and cannot be changed here.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Reusable Input ─────────────────────────────────────────────────────

function SettingsInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
  envOverride,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  envOverride?: boolean
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {envOverride && <span className="ml-1.5 text-amber-500">(env)</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  )
}
