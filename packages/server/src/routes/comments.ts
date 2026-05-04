import { Router } from 'express'
import { nanoid } from 'nanoid'
import { toString } from 'mdast-util-to-string'
import type { Heading, List, ListItem, RootContent, Text } from 'mdast'
import type { Comment } from '@automd/shared'
import { serializeAst } from '@automd/shared'
import * as storage from '../storage.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId } from '../validation.js'
import { broadcast } from '../ws.js'

export const commentsRouter = Router({ mergeParams: true })

type Params = { fileId: string; taskId: string }

function findTaskHeading(ast: any, taskId: string): { index: number; node: Heading } | null {
  for (let i = 0; i < ast.children.length; i++) {
    const node = ast.children[i]
    if (node.type === 'heading' && node.depth === 2 && node.data?.automdId === taskId) return { index: i, node }
  }
  return null
}

function findTaskEnd(ast: any, start: number): number {
  for (let i = start + 1; i < ast.children.length; i++) {
    const node = ast.children[i]
    if (node.type === 'heading' && (node.depth === 1 || node.depth === 2)) return i
  }
  return ast.children.length
}

function mentions(body: string): string[] {
  return [...new Set(Array.from(body.matchAll(/@([A-Za-z][\w-]*)/g)).map((m) => m[1]))]
}

function formatComment(comment: Comment): string {
  return `@${comment.author} ${comment.createdAt} (${comment.id}): ${comment.body.replace(/\s+/g, ' ').trim()}`
}

function parseCommentLine(taskId: string, line: string): Comment | null {
  const match = /^@([A-Za-z][\w-]*)\s+(\S+)\s+\(([^)]+)\):\s*([\s\S]*)$/.exec(line)
  if (!match) return null
  return { id: match[3], taskId, author: match[1], createdAt: match[2], body: match[4], mentions: mentions(match[4]) }
}

function listCommentsFromAst(ast: any, taskId: string): Comment[] {
  const found = findTaskHeading(ast, taskId)
  if (!found) return []
  const end = findTaskEnd(ast, found.index)
  const comments: Comment[] = []
  let inComments = false
  for (let i = found.index + 1; i < end; i++) {
    const node = ast.children[i]
    if (node.type === 'heading' && node.depth === 3) {
      inComments = toString(node).toLowerCase() === 'comments'
      continue
    }
    if (!inComments) continue
    if (node.type === 'list') {
      for (const item of (node as List).children) {
        const parsed = parseCommentLine(taskId, toString(item))
        if (parsed) comments.push(parsed)
      }
    } else if (node.type === 'heading' && node.depth <= 3) {
      break
    }
  }
  return comments
}

function appendCommentToAst(ast: any, taskId: string, comment: Comment): boolean {
  const found = findTaskHeading(ast, taskId)
  if (!found) return false
  let end = findTaskEnd(ast, found.index)
  let commentsHeadingIndex = -1
  for (let i = found.index + 1; i < end; i++) {
    const node = ast.children[i]
    if (node.type === 'heading' && node.depth === 3 && toString(node).toLowerCase() === 'comments') {
      commentsHeadingIndex = i
      break
    }
  }
  if (commentsHeadingIndex === -1) {
    const heading: Heading = { type: 'heading', depth: 3, children: [{ type: 'text', value: 'Comments' } as Text] }
    const list: List = { type: 'list', ordered: false, spread: false, children: [] }
    ast.children.splice(end, 0, heading as RootContent, list as RootContent)
    commentsHeadingIndex = end
    end += 2
  }
  let list = ast.children[commentsHeadingIndex + 1] as List | undefined
  if (!list || list.type !== 'list') {
    list = { type: 'list', ordered: false, spread: false, children: [] }
    ast.children.splice(commentsHeadingIndex + 1, 0, list as RootContent)
  }
  const item: ListItem = {
    type: 'listItem',
    spread: false,
    children: [{ type: 'paragraph', children: [{ type: 'text', value: formatComment(comment) } as Text] }],
  }
  list.children.push(item)
  return true
}

commentsRouter.get('/', (req, res, next) => {
  if (!isValidId(req.params.fileId) || !isValidId(req.params.taskId)) return res.status(400).json({ error: 'Invalid ID format' })
  try {
    const file = storage.getFile(req.params.fileId)
    if (!file) return res.status(404).json({ error: 'Board not found' })
    const { ast } = parseBoard(file.markdown, req.params.fileId)
    res.json({ comments: listCommentsFromAst(ast, req.params.taskId) })
  } catch (err) { next(err) }
})

commentsRouter.post('/', async (req, res, next) => {
  if (!isValidId(req.params.fileId) || !isValidId(req.params.taskId)) return res.status(400).json({ error: 'Invalid ID format' })
  const { author, body } = req.body
  if (!author || !body || typeof author !== 'string' || typeof body !== 'string') return res.status(400).json({ error: 'author and body are required' })
  const comment: Comment = { id: nanoid(10), taskId: req.params.taskId, author, body, createdAt: new Date().toISOString(), mentions: mentions(body) }
  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(req.params.fileId)
      if (!file) return { status: 404 as const }
      const { ast } = parseBoard(file.markdown, req.params.fileId)
      if (!appendCommentToAst(ast, req.params.taskId, comment)) return { status: 404 as const }
      const markdown = serializeAst(ast)
      invalidateBoardCache(req.params.fileId)
      const saved = storage.updateFileMarkdown(req.params.fileId, markdown)
      return { status: 201 as const, file: saved }
    })
    if (result.status === 404) return res.status(404).json({ error: 'Task or board not found' })
    if (result.file) {
      broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
      broadcast({ type: 'comment:added', payload: { taskId: req.params.taskId, fileId: req.params.fileId, comment } })
    }
    res.status(201).json(comment)
  } catch (err) { next(err) }
})
