import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { API_BASE } from '@/lib/api'
import { FileText, Loader2, AlertCircle } from 'lucide-react'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()

      if (res.ok) {
        useAuthStore.getState().setAuth(data.token, email.trim())
      } else {
        setError(data.error || 'Invalid credentials.')
      }
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full text-sm bg-transparent border border-border rounded-lg px-3 py-2.5 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50 transition-colors'

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background paper-texture">
      <div className="w-full max-w-sm mx-auto px-6">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="size-6 text-primary" />
          </div>
          <h1 className="font-display text-2xl tracking-tight text-foreground italic">automd</h1>
          <p className="text-sm text-muted-foreground text-center">
            Sign in to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={emailRef}
            type="email"
            className={inputClass}
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
          />
          <input
            type="password"
            className={inputClass}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={loading || !email || !password} className="mt-1">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
