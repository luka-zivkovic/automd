import { Buffer } from 'node:buffer'
import {
  MAX_SKILL_BYTES,
  saveSkillMarkdown,
  slugifySkill,
  type SkillSaveResult,
} from './skill-storage.js'

const FETCH_TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 3

export class SkillImportUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillImportUrlError'
  }
}

export class SkillImportFetchError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`GitHub returned ${status} while downloading SKILL.md`)
    this.name = 'SkillImportFetchError'
  }
}

export class SkillImportTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Imported skill exceeds maximum size of ${maxBytes} bytes`)
    this.name = 'SkillImportTooLargeError'
  }
}

export interface GithubSkillSource {
  rawUrl: string
  displayUrl: string
  defaultSlug: string
}

export interface SkillImportResult extends SkillSaveResult {
  bytes: number
  source: {
    provider: 'github'
    url: string
  }
}

function splitPathname(url: URL): string[] {
  return url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
}

function sanitizeDisplayUrl(url: URL): string {
  const display = new URL(url.toString())
  display.username = ''
  display.password = ''
  display.search = ''
  display.hash = ''
  return display.toString()
}

function assertHttpsGithubUrl(url: URL) {
  if (url.protocol !== 'https:') {
    throw new SkillImportUrlError('Only HTTPS GitHub URLs are supported')
  }
  if (url.username || url.password) {
    throw new SkillImportUrlError('GitHub URLs must not include credentials')
  }
}

function assertOwnerRepo(owner: string | undefined, repo: string | undefined) {
  if (!owner || !repo) {
    throw new SkillImportUrlError('GitHub URL must include an owner and repository')
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new SkillImportUrlError('GitHub owner and repository contain unsupported characters')
  }
}

function rawGithubUrl(owner: string, repo: string, ref: string, filePath: string[]): string {
  const encoded = [owner, repo, ref, ...filePath].map(encodeURIComponent)
  return `https://raw.githubusercontent.com/${encoded.join('/')}`
}

function skillSlugFromPath(filePath: string[], fallbackRepo: string): string {
  const lower = filePath[filePath.length - 1]?.toLowerCase()
  if (lower !== 'skill.md') {
    throw new SkillImportUrlError('GitHub URL must point to a SKILL.md file or a directory containing SKILL.md')
  }
  return slugifySkill(filePath.length > 1 ? filePath[filePath.length - 2] : fallbackRepo)
}

export function resolveGithubSkillUrl(input: string): GithubSkillSource {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new SkillImportUrlError('Invalid GitHub URL')
  }

  assertHttpsGithubUrl(url)

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let parts: string[]
  try {
    parts = splitPathname(url)
  } catch {
    throw new SkillImportUrlError('Invalid GitHub URL path')
  }

  if (host === 'raw.githubusercontent.com') {
    const owner = parts[0] ?? ''
    const repo = (parts[1] ?? '').replace(/\.git$/i, '')
    const ref = parts[2]
    const filePath = parts.slice(3)
    assertOwnerRepo(owner, repo)
    if (!ref || filePath.length === 0) {
      throw new SkillImportUrlError('Raw GitHub URL must include a ref and SKILL.md path')
    }
    return {
      rawUrl: url.toString(),
      displayUrl: sanitizeDisplayUrl(url),
      defaultSlug: skillSlugFromPath(filePath, repo),
    }
  }

  if (host !== 'github.com') {
    throw new SkillImportUrlError('Only github.com skill URLs are supported')
  }

  const owner = parts[0] ?? ''
  const repo = (parts[1] ?? '').replace(/\.git$/i, '')
  const mode = parts[2]
  const ref = parts[3]
  const rest = parts.slice(4)
  assertOwnerRepo(owner, repo)

  if (!mode) {
    return {
      rawUrl: rawGithubUrl(owner, repo, 'HEAD', ['SKILL.md']),
      displayUrl: sanitizeDisplayUrl(url),
      defaultSlug: slugifySkill(repo),
    }
  }

  if ((mode === 'blob' || mode === 'raw') && ref) {
    if (rest.length === 0) {
      throw new SkillImportUrlError('GitHub file URL must include a SKILL.md path')
    }
    return {
      rawUrl: rawGithubUrl(owner, repo, ref, rest),
      displayUrl: sanitizeDisplayUrl(url),
      defaultSlug: skillSlugFromPath(rest, repo),
    }
  }

  if (mode === 'tree' && ref) {
    const filePath = [...rest, 'SKILL.md']
    return {
      rawUrl: rawGithubUrl(owner, repo, ref, filePath),
      displayUrl: sanitizeDisplayUrl(url),
      defaultSlug: slugifySkill(rest[rest.length - 1] ?? repo),
    }
  }

  throw new SkillImportUrlError('GitHub URL must point to a repository, SKILL.md blob, or skill directory')
}

function assertRawGithubDownloadUrl(url: URL) {
  assertHttpsGithubUrl(url)
  if (url.hostname.toLowerCase() !== 'raw.githubusercontent.com') {
    throw new SkillImportUrlError('GitHub download redirected to an unsupported host')
  }
}

function redirectLocation(res: Response, currentUrl: string): string | null {
  if (![301, 302, 303, 307, 308].includes(res.status)) return null
  const location = res.headers.get('location')
  return location ? new URL(location, currentUrl).toString() : null
}

async function readResponseTextWithLimit(res: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  const contentLength = Number(res.headers.get('content-length') ?? '0')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new SkillImportTooLargeError(maxBytes)
  }

  if (!res.body) {
    const text = await res.text()
    const bytes = Buffer.byteLength(text, 'utf-8')
    if (bytes > maxBytes) throw new SkillImportTooLargeError(maxBytes)
    return { text, bytes }
  }

  const reader = res.body.getReader()
  const chunks: Buffer[] = []
  let bytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      bytes += chunk.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new SkillImportTooLargeError(maxBytes)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }

  return { text: Buffer.concat(chunks, bytes).toString('utf-8'), bytes }
}

async function fetchGithubText(rawUrl: string): Promise<{ text: string; bytes: number }> {
  let currentUrl = rawUrl
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    assertRawGithubDownloadUrl(new URL(currentUrl))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/plain, application/octet-stream;q=0.9, */*;q=0.8',
          'User-Agent': 'automd-skill-importer',
        },
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SkillImportFetchError(408, currentUrl)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    const nextUrl = redirectLocation(res, currentUrl)
    if (nextUrl) {
      currentUrl = nextUrl
      continue
    }

    if (!res.ok) throw new SkillImportFetchError(res.status, currentUrl)
    return readResponseTextWithLimit(res, MAX_SKILL_BYTES)
  }

  throw new SkillImportFetchError(310, currentUrl)
}

export async function importSkillFromGithubUrl(
  sourceUrl: string,
  options: { slug?: string; overwrite?: boolean } = {},
): Promise<SkillImportResult> {
  const source = resolveGithubSkillUrl(sourceUrl)
  const { text, bytes } = await fetchGithubText(source.rawUrl)
  const saved = saveSkillMarkdown(text, options.slug ?? source.defaultSlug, {
    overwrite: options.overwrite === true,
  })

  return {
    ...saved,
    bytes,
    source: {
      provider: 'github',
      url: source.displayUrl,
    },
  }
}
