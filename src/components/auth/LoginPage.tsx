import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/auth-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { API_BASE } from '@/lib/api'
import { Loader2, AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    'w-full text-sm bg-transparent border border-border rounded-md pl-9 pr-3 py-2.5 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/40 transition-colors'

  return (
    <div className="fixed inset-0 flex justify-center bg-background paper-texture overflow-y-auto">
      <div className="w-full max-w-sm mx-auto px-6 pt-[15vh] pb-12 stagger-enter">
        {/* Brand */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <img src="/logo.png" alt="automd" className="size-10 rounded-lg" />
          <div className="text-center">
            <h1 className="font-display text-2xl tracking-tight text-foreground italic">
              automd
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Sign in to your account.
            </p>
          </div>
        </div>

        {/* Form Card */}
        <Card className="card-hover">
          <CardContent className="px-5 py-5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
                <input
                  ref={emailRef}
                  type="email"
                  className={inputClass}
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full text-sm bg-transparent border border-border rounded-md pl-9 pr-9 py-2.5 outline-none focus:border-ring focus:ring-1 focus:ring-ring/30 placeholder:text-muted-foreground/40 transition-colors"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 rounded-md px-3 py-2.5 border border-destructive/10">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Separator className="my-0.5" />

              {/* Submit */}
              <Button type="submit" disabled={loading || !email || !password} className="w-full">
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
