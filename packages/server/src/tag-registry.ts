import * as storage from './storage.js'
import { parseBoard } from './board-cache.js'

const INLINE_TAG_RE = /#([a-zA-Z0-9_-]+)/g

/**
 * Compute all tags actually used across boards.
 * Collects from: frontmatter tags, task metadata labels, inline #tags in learnings.
 */
export function computeUsedTags(projectId?: string): string[] {
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

  return [...tags].sort()
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
