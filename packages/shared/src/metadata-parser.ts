import type { TaskMetadata } from './types.js'

const TOKEN_START = String.raw`(?<![\p{L}\p{N}_-])`
const TOKEN_END = String.raw`(?![\p{L}\p{N}_-])`
const HANDLE = String.raw`[A-Za-z][A-Za-z0-9_-]*`
const LABEL = String.raw`[A-Za-z_][A-Za-z0-9_-]*`
const DATE = String.raw`\d{4}-\d{2}-\d{2}`

const ASSIGNEE_RE = new RegExp(`${TOKEN_START}@(${HANDLE})${TOKEN_END}`, 'gu')
const LABEL_RE = new RegExp(`${TOKEN_START}#(?![0-9]+${TOKEN_END})(?![A-Fa-f0-9]{3}(?:[A-Fa-f0-9]{3})?${TOKEN_END})(${LABEL})${TOKEN_END}`, 'gu')
const DUE_DATE_RE = new RegExp(`${TOKEN_START}due:(${DATE})${TOKEN_END}`, 'giu')
const ESTIMATE_RE = new RegExp(`${TOKEN_START}est:(\\d+(?:\\.\\d+)?)(?:h)?(?![\\p{L}\\p{N}_.-])`, 'giu')
const PRIORITY_RE = new RegExp(`${TOKEN_START}priority:(high|medium|low)${TOKEN_END}`, 'giu')
const STATUS_RE = new RegExp(`${TOKEN_START}status:(todo|in_progress|blocked|in_review|done)${TOKEN_END}`, 'giu')
const CREATED_BY_RE = new RegExp(`${TOKEN_START}created-by:(${HANDLE})${TOKEN_END}`, 'giu')
const BUILT_BY_RE = new RegExp(`${TOKEN_START}built-by:(${HANDLE})${TOKEN_END}`, 'giu')
const CLAIMED_AT_RE = new RegExp(`${TOKEN_START}claimed-at:([0-9]{4}-[0-9]{2}-[0-9]{2}T[^\\s]+)${TOKEN_END}`, 'giu')
const ARCHIVED_RE = new RegExp(`${TOKEN_START}archived:true${TOKEN_END}`, 'giu')
const COMPLETED_AT_RE = new RegExp(`${TOKEN_START}completed-at:(${DATE})${TOKEN_END}`, 'giu')
const KNOWLEDGE_RE = new RegExp(`${TOKEN_START}knowledge:true${TOKEN_END}`, 'giu')

interface TokenSpan { start: number; end: number }

function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
}

function reset(re: RegExp): RegExp {
  re.lastIndex = 0
  return re
}

function addSpan(spans: TokenSpan[], match: RegExpExecArray) {
  spans.push({ start: match.index, end: match.index + match[0].length })
}

function stripSpans(content: string, spans: TokenSpan[]): string {
  if (spans.length === 0) return content.trim()
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let result = ''
  let cursor = 0
  for (const span of sorted) {
    if (span.start < cursor) continue
    result += content.slice(cursor, span.start)
    result += ' '
    cursor = span.end
  }
  result += content.slice(cursor)
  return result.replace(/\s{2,}/g, ' ').trim()
}

export function emptyMetadata(): TaskMetadata {
  return {
    assignees: [],
    labels: [],
    dueDate: null,
    estimate: null,
    priority: null,
    createdBy: null,
    builtBy: null,
    agentId: null,
    claimedAt: null,
    status: null,
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
  const spans: TokenSpan[] = []

  for (const match of content.matchAll(reset(ASSIGNEE_RE))) {
    metadata.assignees.push(match[1])
    addSpan(spans, match)
  }
  metadata.assignees = [...new Set(metadata.assignees)]

  for (const match of content.matchAll(reset(LABEL_RE))) {
    metadata.labels.push(match[1])
    addSpan(spans, match)
  }
  metadata.labels = [...new Set(metadata.labels)]

  for (const match of content.matchAll(reset(DUE_DATE_RE))) {
    if (validIsoDate(match[1])) {
      metadata.dueDate = match[1]
      addSpan(spans, match)
    }
    break
  }

  for (const match of content.matchAll(reset(ESTIMATE_RE))) {
    const val = Number(match[1])
    if (Number.isFinite(val) && val > 0 && val <= 9999) {
      metadata.estimate = val
      addSpan(spans, match)
    }
    break
  }

  for (const match of content.matchAll(reset(PRIORITY_RE))) {
    metadata.priority = match[1].toLowerCase() as TaskMetadata['priority']
    addSpan(spans, match)
    break
  }

  for (const match of content.matchAll(reset(STATUS_RE))) {
    metadata.status = match[1].toLowerCase() as TaskMetadata['status']
    addSpan(spans, match)
    break
  }

  for (const match of content.matchAll(reset(CREATED_BY_RE))) {
    metadata.createdBy = match[1]
    addSpan(spans, match)
    break
  }

  for (const match of content.matchAll(reset(BUILT_BY_RE))) {
    metadata.builtBy = match[1]
    addSpan(spans, match)
    break
  }

  for (const match of content.matchAll(reset(CLAIMED_AT_RE))) {
    const date = new Date(match[1])
    if (!Number.isNaN(date.getTime())) {
      metadata.claimedAt = match[1]
      addSpan(spans, match)
    }
    break
  }

  for (const match of content.matchAll(reset(ARCHIVED_RE))) {
    metadata.archived = true
    addSpan(spans, match)
    break
  }

  for (const match of content.matchAll(reset(COMPLETED_AT_RE))) {
    if (validIsoDate(match[1])) {
      metadata.completedAt = match[1]
      addSpan(spans, match)
    }
    break
  }

  for (const match of content.matchAll(reset(KNOWLEDGE_RE))) {
    metadata.knowledge = true
    addSpan(spans, match)
    break
  }

  return { metadata, displayContent: stripSpans(content, spans) }
}
