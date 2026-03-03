import type {
  WebhookPayload,
  WebhookTemplate,
  WebhookEventType,
  WebhookEventData,
  TaskEventData,
  BoardEventData,
  ProjectEventData,
} from './webhook-events.js'

// ─── Public API ──────────────────────────────────────────────────────────

export function formatPayload(
  payload: WebhookPayload,
  template: WebhookTemplate | null,
): object {
  switch (template) {
    case 'slack':
      return formatSlackPayload(payload)
    case 'discord':
      return formatDiscordPayload(payload)
    default:
      return payload
  }
}

// ─── Event Display Helpers ───────────────────────────────────────────────

function getEventTitle(event: WebhookEventType, data: WebhookEventData): string {
  if ('taskId' in data) {
    const d = data as TaskEventData
    switch (event) {
      case 'task.created':     return `New task: ${d.taskTitle}`
      case 'task.completed':   return `Task completed: ${d.taskTitle}`
      case 'task.uncompleted': return `Task reopened: ${d.taskTitle}`
      case 'task.moved':       return `Task moved: ${d.taskTitle}`
      case 'task.updated':     return `Task updated: ${d.taskTitle}`
      case 'task.deleted':     return `Task deleted: ${d.taskTitle}`
    }
  }
  if ('boardId' in data && !('taskId' in data)) {
    const d = data as BoardEventData
    switch (event) {
      case 'board.created': return `Board created: ${d.boardName}`
      case 'board.updated': return `Board updated: ${d.boardName}`
      case 'board.deleted': return `Board deleted: ${d.boardName}`
    }
  }
  if ('projectId' in data) {
    const d = data as ProjectEventData
    switch (event) {
      case 'project.created': return `Project created: ${d.projectName}`
      case 'project.updated': return `Project updated: ${d.projectName}`
      case 'project.deleted': return `Project deleted: ${d.projectName}`
    }
  }
  return `AutoMD: ${event}`
}

function getEventDetail(event: WebhookEventType, data: WebhookEventData): string {
  if ('taskId' in data) {
    const d = data as TaskEventData
    if (event === 'task.moved' && d.previousColumn) {
      return `${d.previousColumn} → ${d.column} · ${d.boardName}`
    }
    return `Board: ${d.boardName} · Column: ${d.column}`
  }
  return ''
}

function getEventColor(event: WebhookEventType): string {
  if (event === 'task.completed') return '#22c55e'
  if (event.endsWith('.deleted')) return '#ef4444'
  if (event.endsWith('.created')) return '#3b82f6'
  return '#6b7280'
}

// ─── Slack (Block Kit) ───────────────────────────────────────────────────

function formatSlackPayload(payload: WebhookPayload): object {
  const { event, data, timestamp } = payload
  const title = getEventTitle(event, data)
  const detail = getEventDetail(event, data)
  const color = getEventColor(event)

  return {
    text: title,
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*${title}*${detail ? `\n${detail}` : ''}` },
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `AutoMD · ${new Date(timestamp).toLocaleString()}` },
            ],
          },
        ],
      },
    ],
  }
}

// ─── Discord (Embeds) ────────────────────────────────────────────────────

function formatDiscordPayload(payload: WebhookPayload): object {
  const { event, data, timestamp } = payload
  const title = getEventTitle(event, data)
  const detail = getEventDetail(event, data)
  const color = parseInt(getEventColor(event).slice(1), 16)

  return {
    content: null,
    embeds: [
      {
        title,
        description: detail || undefined,
        color,
        footer: { text: 'AutoMD' },
        timestamp,
      },
    ],
  }
}
