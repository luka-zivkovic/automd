// ─── Webhook Event Types ─────────────────────────────────────────────────

export type WebhookEventType =
  // Task events (granular)
  | 'task.created'
  | 'task.completed'
  | 'task.uncompleted'
  | 'task.moved'
  | 'task.updated'
  | 'task.deleted'
  // Board events
  | 'board.created'
  | 'board.updated'
  | 'board.deleted'
  // Project events
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'

export const ALL_WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  'task.created', 'task.completed', 'task.uncompleted', 'task.moved',
  'task.updated', 'task.deleted',
  'board.created', 'board.updated', 'board.deleted',
  'project.created', 'project.updated', 'project.deleted',
]

// ─── Payload Types ───────────────────────────────────────────────────────

export interface TaskEventData {
  taskId: string
  boardId: string
  boardName: string
  taskTitle: string
  column: string
  checked: boolean | null
  previousColumn?: string
  action?: string
}

export interface BoardEventData {
  boardId: string
  boardName: string
}

export interface ProjectEventData {
  projectId: string
  projectName: string
  color?: string
}

export type WebhookEventData = TaskEventData | BoardEventData | ProjectEventData

export interface WebhookPayload {
  id: string
  event: WebhookEventType
  timestamp: string
  data: WebhookEventData
}

// ─── Webhook Registration ────────────────────────────────────────────────

export type WebhookTemplate = 'slack' | 'discord'

export interface WebhookRegistration {
  id: string
  name: string
  url: string
  secret: string
  events: WebhookEventType[]
  enabled: boolean
  template: WebhookTemplate | null
  createdAt: number
  updatedAt: number
  stats: {
    totalDelivered: number
    totalFailed: number
    lastDeliveredAt: number | null
    lastFailedAt: number | null
    lastStatusCode: number | null
  }
}

export interface WebhookData {
  webhooks: WebhookRegistration[]
}
