import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import { getAutomdDir } from './config.js'

export type ActivityRecordType = 'task.reopened'

export interface ActivityRecord {
  id: string
  type: ActivityRecordType
  timestamp: number
  itemId: string
  itemName: string
  taskId: string
  taskTitle: string
  agentSlug: string | null
}

interface ActivityData {
  events: ActivityRecord[]
}

const MAX_EVENTS = 1000

function activityPath() {
  return path.join(getAutomdDir(), 'activity.json')
}

function ensureDir() {
  fs.mkdirSync(getAutomdDir(), { recursive: true })
}

function readData(): ActivityData {
  ensureDir()
  const p = activityPath()
  if (!fs.existsSync(p)) return { events: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return { events: Array.isArray(parsed.events) ? parsed.events : [] }
  } catch {
    return { events: [] }
  }
}

function writeData(data: ActivityData) {
  ensureDir()
  const p = activityPath()
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ events: data.events.slice(-MAX_EVENTS) }, null, 2), 'utf-8')
  fs.renameSync(tmp, p)
}

export function listActivity(): ActivityRecord[] {
  return readData().events
}

export function appendActivity(input: Omit<ActivityRecord, 'id' | 'timestamp'> & { timestamp?: number }): ActivityRecord {
  const event: ActivityRecord = {
    id: nanoid(10),
    timestamp: input.timestamp ?? Date.now(),
    type: input.type,
    itemId: input.itemId,
    itemName: input.itemName,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
    agentSlug: input.agentSlug,
  }
  const data = readData()
  data.events.push(event)
  writeData(data)
  return event
}
