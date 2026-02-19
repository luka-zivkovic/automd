import { getAppVersion } from './version.js'

const GITHUB_REPO = 'luka-zivkovic/automd'
const DEFAULT_CHECK_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours

interface UpdateInfo {
  current: string
  latest: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  checkedAt: number | null
}

let cached: { latest: string; releaseUrl: string; checkedAt: number } | null = null

function isDisabled(): boolean {
  return process.env.AUTOMD_DISABLE_UPDATE_CHECK === 'true'
}

function getCheckInterval(): number {
  const env = process.env.AUTOMD_UPDATE_CHECK_INTERVAL
  if (env) {
    const parsed = parseInt(env, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_CHECK_INTERVAL
}

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [lMaj, lMin = 0, lPat = 0] = parse(latest)
  const [cMaj, cMin = 0, cPat = 0] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

async function fetchLatestRelease(): Promise<void> {
  if (isDisabled()) return

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)

    if (!res.ok) return

    const data = await res.json() as { tag_name?: string; html_url?: string }
    if (data.tag_name) {
      cached = {
        latest: data.tag_name.replace(/^v/, ''),
        releaseUrl: data.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
        checkedAt: Date.now(),
      }
    }
  } catch {
    // Silently fail — air-gapped or rate-limited environments
  }
}

export function startUpdateChecker(): void {
  if (isDisabled()) return
  // Initial check after 10s (don't block startup)
  setTimeout(fetchLatestRelease, 10_000)
  setInterval(fetchLatestRelease, getCheckInterval())
}

export function getUpdateInfo(): UpdateInfo {
  const current = getAppVersion()
  if (!cached) {
    return { current, latest: null, updateAvailable: false, releaseUrl: null, checkedAt: null }
  }
  return {
    current,
    latest: cached.latest,
    updateAvailable: isNewerVersion(cached.latest, current),
    releaseUrl: cached.releaseUrl,
    checkedAt: cached.checkedAt,
  }
}
