import * as storage from './storage.js'
import { parseBoard } from './board-cache.js'

/** Matches inline #tags in learnings text. Supports unicode letters/numbers. */
const INLINE_TAG_RE = /#([\p{L}\p{N}_-]+)/gu

/** Simple time-based cache for computeUsedTags results. */
let tagCache: { key: string; tags: string[]; ts: number } | null = null
const CACHE_TTL_MS = 5_000

/**
 * Compute all tags actually used across boards.
 * Collects from: frontmatter tags, task metadata labels, inline #tags in learnings.
 * Results are cached for 5 seconds to avoid redundant full scans.
 */
export function computeUsedTags(projectId?: string): string[] {
  const cacheKey = projectId ?? '__all__'
  const now = Date.now()
  if (tagCache && tagCache.key === cacheKey && now - tagCache.ts < CACHE_TTL_MS) {
    return tagCache.tags
  }

  const files = storage.listFiles()
  const tags = new Set<string>()

  for (const file of files) {
    if (projectId && file.projectId !== projectId) continue
    if (!file.markdown) continue

    const { tasks, meta } = parseBoard(file.markdown, file.id)

    // Frontmatter tags
    if (meta?.tags) {
      for (const t of meta.tags) tags.add(t.toLowerCase())
    }

    // Task labels + inline tags in learnings
    const stack = [...tasks]
    while (stack.length > 0) {
      const task = stack.pop()!
      for (const label of task.metadata.labels) {
        tags.add(label.toLowerCase())
      }
      if (task.learnings) {
        for (const match of task.learnings.matchAll(INLINE_TAG_RE)) {
          tags.add(match[1].toLowerCase())
        }
      }
      for (let i = task.children.length - 1; i >= 0; i--) {
        stack.push(task.children[i])
      }
    }
  }

  const result = [...tags].sort()
  tagCache = { key: cacheKey, tags: result, ts: now }
  return result
}

/** Invalidate the tag cache (call after writes that affect tags). */
export function invalidateTagCache() {
  tagCache = null
}

/**
 * Get merged tags from all sources: instance curated, project curated, and used.
 */
export function getMergedTags(projectId?: string) {
  const curated = storage.getInstanceTags()

  let projectTags: string[] = []
  if (projectId) {
    const projects = storage.listProjects()
    const project = projects.find(p => p.id === projectId)
    projectTags = project?.tags ?? []
  }

  const used = computeUsedTags(projectId)

  const merged = [...new Set([...curated, ...projectTags, ...used])].sort()

  return { curated, projectTags, used, merged }
}
