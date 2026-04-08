import type { TaskMetadata } from './types.js'

const ASSIGNEE_RE = /(?:^|\s)@(\w[\w-]*)/g
const LABEL_RE = /(?:^|\s)#(\w[\w-]*)/g
const DUE_DATE_RE = /due:(\d{4}-\d{2}-\d{2})/i
const ESTIMATE_RE = /est:([\d.]+)h?/i
const PRIORITY_RE = /priority:(high|medium|low)/i
const CREATED_BY_RE = /created-by:([\w-]+)/i
const BUILT_BY_RE = /built-by:([\w-]+)/i
const ARCHIVED_RE = /archived:true/i
const COMPLETED_AT_RE = /completed-at:(\d{4}-\d{2}-\d{2})/i
const KNOWLEDGE_RE = /knowledge:true/i

// All token patterns for stripping — order matters (longer patterns first)
const ALL_TOKENS_RE =
  /\s*(?:knowledge:true|completed-at:\d{4}-\d{2}-\d{2}|archived:true|created-by:[\w-]+|built-by:[\w-]+|priority:(?:high|medium|low)|est:[\d.]+h?|due:\d{4}-\d{2}-\d{2}|@\w[\w-]*|#\w[\w-]*)\s*/gi

export function emptyMetadata(): TaskMetadata {
  return {
    assignees: [],
    labels: [],
    dueDate: null,
    estimate: null,
    priority: null,
    createdBy: null,
    builtBy: null,
    archived: false,
    completedAt: null,
    knowledge: false,
  }
}

export function parseMetadata(content: string): {
  metadata: TaskMetadata
  displayContent: string
} {
  const metadata = emptyMetadata()

  // Extract assignees
  for (const match of content.matchAll(ASSIGNEE_RE)) {
    metadata.assignees.push(match[1])
  }
  metadata.assignees = [...new Set(metadata.assignees)]

  // Extract labels
  for (const match of content.matchAll(LABEL_RE)) {
    metadata.labels.push(match[1])
  }
  metadata.labels = [...new Set(metadata.labels)]

  // Extract due date
  const dueMatch = content.match(DUE_DATE_RE)
  if (dueMatch) {
    const d = new Date(dueMatch[1])
    if (!isNaN(d.getTime())) metadata.dueDate = dueMatch[1]
  }

  // Extract estimate
  const estMatch = content.match(ESTIMATE_RE)
  if (estMatch) {
    const val = parseFloat(estMatch[1])
    if (isFinite(val) && val > 0 && val <= 9999) metadata.estimate = val
  }

  // Extract priority
  const prioMatch = content.match(PRIORITY_RE)
  if (prioMatch) metadata.priority = prioMatch[1].toLowerCase() as TaskMetadata['priority']

  // Extract signatures
  const createdMatch = content.match(CREATED_BY_RE)
  if (createdMatch) metadata.createdBy = createdMatch[1]

  const builtMatch = content.match(BUILT_BY_RE)
  if (builtMatch) metadata.builtBy = builtMatch[1]

  // Extract archived flag
  if (content.match(ARCHIVED_RE)) metadata.archived = true

  // Extract completed-at date
  const completedMatch = content.match(COMPLETED_AT_RE)
  if (completedMatch) {
    const d = new Date(completedMatch[1])
    if (!isNaN(d.getTime())) metadata.completedAt = completedMatch[1]
  }

  // Extract knowledge flag
  if (content.match(KNOWLEDGE_RE)) metadata.knowledge = true

  // Strip all tokens to get display content
  const displayContent = content
    .replace(ALL_TOKENS_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return { metadata, displayContent }
}
