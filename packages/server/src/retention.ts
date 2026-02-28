import {
  serializeAst,
  deleteTask,
  parseMarkdown,
  extractFrontmatter,
} from '@automd/shared'
import type { Task, RetentionConfig } from '@automd/shared'
import type { Root, Heading, RootContent } from 'mdast'
import { nanoid } from 'nanoid'
import * as storage from './storage.js'
import { broadcast } from './ws.js'
import { withWriteLock } from './write-lock.js'
import { parseBoard, invalidateBoardCache } from './board-cache.js'

const DEFAULT_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
const INITIAL_DELAY = 60 * 1000 // 1 minute after startup
const MS_PER_DAY = 1000 * 60 * 60 * 24

let timer: ReturnType<typeof setInterval> | null = null

export function startRetentionRunner(): void {
  if (process.env.AUTOMD_DISABLE_RETENTION === 'true') {
    console.log('[retention] Disabled (AUTOMD_DISABLE_RETENTION=true)')
    return
  }

  const interval = getInterval()
  console.log(`[retention] Starting with interval ${Math.round(interval / 1000 / 60)}m`)

  setTimeout(() => {
    runRetention().catch(err => {
      console.error('[retention] Initial run failed:', err)
    })
  }, INITIAL_DELAY)

  timer = setInterval(() => {
    runRetention().catch(err => {
      console.error('[retention] Periodic run failed:', err)
    })
  }, interval)
}

export function stopRetentionRunner(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function getInterval(): number {
  const env = process.env.AUTOMD_RETENTION_INTERVAL
  if (env) {
    const parsed = parseInt(env, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_INTERVAL
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY)
}

function flattenTasks(columns: Array<{ tasks: Task[] }>): Task[] {
  return columns.flatMap(c => c.tasks)
}

export async function runRetention(): Promise<void> {
  const files = storage.listFiles()
  const today = new Date()
  let totalArchived = 0
  let totalDeleted = 0

  for (const file of files) {
    // Skip archive boards — they don't have their own retention
    const ast = parseMarkdown(file.markdown)
    const meta = extractFrontmatter(ast)
    if (meta?.archiveFor) continue
    if (meta?.backlogFor) continue

    try {
      const result = await processBoard(file.id, file.name, today)
      totalArchived += result.archived
      totalDeleted += result.deleted
    } catch (err) {
      console.error(`[retention] Failed to process board ${file.id}:`, err)
    }
  }

  if (totalArchived > 0 || totalDeleted > 0) {
    console.log(`[retention] Run complete: ${totalArchived} archived, ${totalDeleted} deleted`)
  }
}

interface RetentionResult {
  archived: number
  deleted: number
}

/**
 * Extract the AST nodes belonging to a task (H2 heading + body nodes until next H1/H2).
 */
function extractTaskNodes(ast: Root, taskId: string): RootContent[] {
  const nodes: RootContent[] = []
  let capturing = false

  for (const child of ast.children) {
    if (child.type === 'heading') {
      const heading = child as Heading
      const id = (heading.data as Record<string, unknown>)?.automdId as string

      if (heading.depth === 2 && id === taskId) {
        capturing = true
        nodes.push(child)
        continue
      }

      // Stop at next H1 or H2
      if (capturing && (heading.depth === 1 || heading.depth === 2)) {
        break
      }
    }

    if (capturing) {
      nodes.push(child)
    }
  }

  return nodes
}

/**
 * Serialize task AST nodes to markdown text.
 */
function serializeTaskNodes(nodes: RootContent[]): string {
  const root: Root = { type: 'root', children: [...nodes] }
  return serializeAst(root)
}

/**
 * Append archived tasks to an archive board's markdown under a date heading.
 */
function appendToArchiveBoard(archiveBoardId: string, tasksMarkdown: string, dateStr: string): void {
  const archiveFile = storage.getFile(archiveBoardId)
  if (!archiveFile) return

  let md = archiveFile.markdown.trimEnd()
  const dateHeading = `# Archived ${dateStr}`

  // Only add a new date heading if one for today doesn't already exist
  if (!md.includes(dateHeading)) {
    md += `\n\n${dateHeading}\n\n`
  } else {
    md += '\n\n'
  }
  md += tasksMarkdown.trim()
  md += '\n'

  invalidateBoardCache(archiveBoardId)
  storage.updateFileMarkdown(archiveBoardId, md)
  broadcast({ type: 'file:updated', payload: { id: archiveBoardId, markdown: md } })
}

async function processBoard(boardId: string, boardName: string, today: Date): Promise<RetentionResult> {
  // First pass: check if board has retention config (read-only, no lock needed)
  const file = storage.getFile(boardId)
  if (!file) return { archived: 0, deleted: 0 }

  const { meta } = parseBoard(file.markdown, boardId)
  if (!meta?.retention) return { archived: 0, deleted: 0 }

  const retention = meta.retention

  // Second pass: inside write lock, re-read and mutate
  return withWriteLock(() => {
    const currentFile = storage.getFile(boardId)
    if (!currentFile) return { archived: 0, deleted: 0 }

    const { ast, columns } = parseBoard(currentFile.markdown, boardId)
    const tasks = flattenTasks(columns)

    const toArchive: Task[] = []
    const toDelete: string[] = []

    for (const task of tasks) {
      // Rule 1: Move completed tasks to archive board after N days
      if (
        retention.archiveDoneAfter !== undefined &&
        !task.metadata.archived &&
        task.checked &&
        task.metadata.completedAt
      ) {
        const completedDate = new Date(task.metadata.completedAt)
        if (daysBetween(completedDate, today) >= retention.archiveDoneAfter) {
          toArchive.push(task)
        }
      }

      // Rule 2: Delete tasks flagged archived after M days (for boards still using in-place archive)
      if (
        retention.deleteArchivedAfter !== undefined &&
        task.metadata.archived &&
        task.metadata.archivedAt
      ) {
        const archivedDate = new Date(task.metadata.archivedAt)
        if (daysBetween(archivedDate, today) >= retention.deleteArchivedAfter) {
          toDelete.push(task.id)
        }
      }
    }

    if (toArchive.length === 0 && toDelete.length === 0) {
      return { archived: 0, deleted: 0 }
    }

    const todayStr = today.toISOString().slice(0, 10)

    // Move tasks to archive board
    if (toArchive.length > 0) {
      // Extract markdown for each task before deleting from source
      const taskChunks: string[] = []
      for (const task of toArchive) {
        const nodes = extractTaskNodes(ast, task.id)
        if (nodes.length > 0) {
          taskChunks.push(serializeTaskNodes(nodes))
        }
      }

      // Get or create the archive board
      const archiveBoard = storage.getOrCreateArchiveBoard(
        boardId,
        boardName,
        () => nanoid(10),
      )

      // Append all archived tasks to the archive board
      if (taskChunks.length > 0) {
        appendToArchiveBoard(archiveBoard.id, taskChunks.join('\n'), todayStr)
      }
    }

    // Remove archived + deleted tasks from source board
    let currentAst = ast
    for (const task of toArchive) {
      currentAst = deleteTask(currentAst, task.id)
    }
    for (const taskId of toDelete) {
      currentAst = deleteTask(currentAst, taskId)
    }

    const markdown = serializeAst(currentAst)
    invalidateBoardCache(boardId)
    storage.updateFileMarkdown(boardId, markdown)
    broadcast({ type: 'file:updated', payload: { id: boardId, markdown } })

    return { archived: toArchive.length, deleted: toDelete.length }
  })
}
