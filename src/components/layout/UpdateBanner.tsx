import { useEffect, useState } from 'react'
import { X, ArrowUpCircle } from 'lucide-react'

const SERVER_URL = import.meta.env.VITE_AUTOMD_SERVER ?? ''
const DISMISSED_KEY = 'automd:update-dismissed-version'

interface VersionInfo {
  current: string
  latest: string | null
  updateAvailable: boolean
  releaseUrl: string | null
}

export function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!SERVER_URL) return

    const apiBase = `${SERVER_URL}/api`
    fetch(`${apiBase}/version`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: VersionInfo | null) => {
        if (!data?.updateAvailable || !data.latest) return
        const dismissedVersion = localStorage.getItem(DISMISSED_KEY)
        if (dismissedVersion === data.latest) return
        setInfo(data)
      })
      .catch(() => {})
  }, [])

  if (!info || dismissed) return null

  function handleDismiss() {
    if (info?.latest) {
      localStorage.setItem(DISMISSED_KEY, info.latest)
    }
    setDismissed(true)
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/20 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        <ArrowUpCircle className="size-4 text-primary shrink-0" />
        <span>
          AutoMD <strong>v{info.latest}</strong> is available.
          {info.current && <span className="text-muted-foreground"> You're running v{info.current}.</span>}
        </span>
        {info.releaseUrl && (
          <a
            href={info.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            View release
          </a>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
        aria-label="Dismiss update notification"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
