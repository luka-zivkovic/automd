import type { TaskMetadata } from './types.js'

export function serializeMetadata(
  displayContent: string,
  metadata: TaskMetadata
): string {
  const tokens: string[] = []

  for (const assignee of metadata.assignees) {
    tokens.push(`@${assignee}`)
  }

  for (const label of metadata.labels) {
    tokens.push(`#${label}`)
  }

  if (metadata.priority) {
    tokens.push(`priority:${metadata.priority}`)
  }

  if (metadata.dueDate) {
    tokens.push(`due:${metadata.dueDate}`)
  }

  if (metadata.estimate !== null) {
    tokens.push(`est:${metadata.estimate}h`)
  }

  if (metadata.createdBy) {
    tokens.push(`created-by:${metadata.createdBy}`)
  }

  if (metadata.builtBy) {
    tokens.push(`built-by:${metadata.builtBy}`)
  }

  if (metadata.completedAt) {
    tokens.push(`completed-at:${metadata.completedAt}`)
  }

  if (metadata.archivedAt) {
    tokens.push(`archived-at:${metadata.archivedAt}`)
  }

  if (metadata.archived) {
    tokens.push('archived:true')
  }

  if (tokens.length === 0) return displayContent
  return `${displayContent} ${tokens.join(' ')}`
}
