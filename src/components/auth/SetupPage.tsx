import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { API_BASE } from '@/lib/api'
import { FileText, Loader2, AlertCircle } from 'lucide-react'

export function SetupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !/^.+@.+\..+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      })
      const data = await res.json()

      if (res.ok) {
        useAuthStore.getState().setAuth(data.token, trimmedEmail)
      } else {
        setError(data.error || 'Setup failed.')
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
            Create your admin account to get started.
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
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
          />
          <input
            type="password"
            className={inputClass}
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
          />

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" disabled={loading || !email || !password || !confirmPassword} className="mt-1">
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create admin account'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
