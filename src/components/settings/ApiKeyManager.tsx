import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { KeyRound, Plus, Trash2, Copy, Check, Loader2, AlertCircle } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAt: number
}

export function ApiKeyManager() {
  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const loadKeys = useCallback(async () => {
    setLoading(true)
    const result = await apiFetch<ApiKey[]>('/auth/api-keys')
    if (result.ok) setKeys(result.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) loadKeys()
  }, [open, loadKeys])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setRevealedKey(null)
        setCreating(false)
        setError(null)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newKeyName.trim()
    if (!name) return

    setError(null)
    const result = await apiFetch<ApiKey & { fullKey: string }>('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })

    if (result.ok) {
      setRevealedKey(result.data.fullKey)
      setNewKeyName('')
      setCreating(false)
      loadKeys()
    } else {
      setError(result.error)
    }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/auth/api-keys/${id}`, { method: 'DELETE' })
    setRevealedKey(null)
    loadKeys()
  }

  function handleCopy() {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground"
        title="API Keys"
      >
        <KeyRound className="size-4" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-popover border border-border rounded-lg shadow-lg p-3 z-50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">API Keys</span>
            {!creating && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setCreating(true)
                  setRevealedKey(null)
                  setTimeout(() => nameInputRef.current?.focus(), 0)
                }}
              >
                <Plus className="size-3.5" />
                New key
              </Button>
            )}
          </div>

          {/* Revealed key banner */}
          {revealedKey && (
            <div className="mb-3 p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1.5">
                Copy this key now — it won't be shown again.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border border-border font-mono truncate select-all">
                  {revealedKey}
                </code>
                <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy">
                  {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Create form */}
          {creating && (
            <form onSubmit={handleCreate} className="flex gap-1.5 mb-3">
              <input
                ref={nameInputRef}
                type="text"
                className="flex-1 text-sm bg-transparent border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-primary placeholder:text-muted-foreground/50"
                placeholder="Key name (e.g., MCP)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setCreating(false) }}
              />
              <Button type="submit" size="sm" disabled={!newKeyName.trim()}>
                Create
              </Button>
            </form>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive mb-2">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Key list */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              No API keys yet. Create one to use with MCP or integrations.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent/40 group"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{key.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {key.keyPrefix}...
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(key.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    title="Delete key"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
