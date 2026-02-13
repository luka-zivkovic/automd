import type { Root } from 'mdast'

export interface TaskMetadata {
  assignees: string[]
  labels: string[]
  dueDate: string | null
  estimate: number | null
  priority: 'high' | 'medium' | 'low' | null
  createdBy: string | null
  builtBy: string | null
}

export interface Task {
  id: string
  content: string
  displayContent: string
  metadata: TaskMetadata
  checked: boolean
  column: string
  parentHeadingId: string
  depth: number
  description: string | null
  children: Task[]
}

export interface Column {
  id: string
  title: string
  tasks: Task[]
}

export interface DocumentState {
  markdown: string
  ast: Root | null
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
}

export interface IdCache {
  fingerprints: Map<string, string> // fingerprint -> id
  ids: Map<string, string> // id -> fingerprint
}
