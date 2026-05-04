import type { Root } from 'mdast'

export interface TaskMetadata {
  assignees: string[]
  labels: string[]
  dueDate: string | null
  estimate: number | null
  priority: 'high' | 'medium' | 'low' | null
  createdBy: string | null
  builtBy: string | null
  agentId?: string | null
  claimedAt?: string | null
  status?: 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done' | null
  archived: boolean
  completedAt: string | null
  knowledge: boolean
}

export type AgentRuntime = 'claude-code' | 'codex' | 'cursor' | 'unknown'
export type AgentStatus = 'active' | 'paused' | 'archived'

export interface Agent {
  id: string
  name: string
  slug: string
  avatar: string | null
  runtime: AgentRuntime
  model: string | null
  status: AgentStatus
  mcpServers: string[]
  env: Record<string, string>
  capabilities: string[]
  createdAt: number
  updatedAt: number
  body?: string
}

export interface Comment {
  id: string
  taskId: string
  author: string
  createdAt: string
  body: string
  mentions: string[]
}

export interface Task {
  id: string
  content: string
  displayContent: string
  metadata: TaskMetadata
  checked: boolean | null
  column: string
  parentHeadingId: string
  depth: number
  description: string | null
  acceptanceCriteria: string | null
  learnings: string | null
  children: Task[]
}

export interface Column {
  id: string
  title: string
  tasks: Task[]
}

/** Flexible, domain-agnostic label dimensions for a board.
 * e.g. { technology: ["react","node"], pattern: ["singleton","observer"] } */
export type BoardVocabulary = Record<string, string[]>

export interface BoardMeta {
  board?: string
  project?: string
  projectId?: string
  description?: string
  tags?: string[]
  vocabulary?: BoardVocabulary
}

export interface DocumentState {
  markdown: string
  ast: Root | null
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
  meta: BoardMeta | null
}

export interface IdCache {
  fingerprints: Map<string, string> // fingerprint -> id
  ids: Map<string, string> // id -> fingerprint
}

export type ItemType = 'board' | 'checklist' | 'page' | 'knowledge'

export interface BoardFile {
  id: string
  name: string
  markdown: string
  createdAt: number
  updatedAt: number
  projectId: string | null
  itemType: ItemType
}

export interface Project {
  id: string
  name: string
  color: string
  fileIds: string[]
  createdAt: number
  markdown?: string
  tags?: string[]
}
