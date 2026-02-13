import { Router, type Request } from 'express'
import { nanoid } from 'nanoid'
import {
  parseMarkdown,
  serializeAst,
  annotateIds,
  createIdCache,
  extractTasksAndColumns,
  toggleTask,
  moveTask,
  addTask,
  updateTaskContent,
  updateTaskMetadata,
  deleteTask,
  emptyMetadata,
} from '@automd/shared'
import type { TaskMetadata } from '@automd/shared'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'

type FileParams = { fileId: string }
type TaskParams = { fileId: string; taskId: string }

export const tasksRouter = Router({ mergeParams: true })

function parseBoard(markdown: string) {
  const cache = createIdCache()
  const ast = annotateIds(parseMarkdown(markdown), cache)
  const extracted = extractTasksAndColumns(ast)
  return { ast, cache, ...extracted }
}

function saveAndBroadcast(fileId: string, markdown: string) {
  const file = storage.updateFileMarkdown(fileId, markdown)
  if (file) {
    broadcast({ type: 'file:updated', payload: { id: file.id, markdown: file.markdown } })
  }
  return file
}

// List tasks in a board
tasksRouter.get('/', (req: Request<FileParams>, res) => {
  const file = storage.getFile(req.params.fileId)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const { columns, tasks } = parseBoard(file.markdown)
  res.json({ columns, tasks })
})

// Add a task to a column
tasksRouter.post('/', (req: Request<FileParams>, res) => {
  const { columnId, content } = req.body
  if (!columnId || !content) {
    res.status(400).json({ error: 'columnId and content are required' })
    return
  }

  const file = storage.getFile(req.params.fileId)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const { ast } = parseBoard(file.markdown)
  const taskId = nanoid(10)
  const newAst = addTask(ast, columnId, content, taskId)
  const markdown = serializeAst(newAst)

  saveAndBroadcast(req.params.fileId, markdown)

  res.status(201).json({ taskId, content })
})

// Update a task (toggle, move, edit content, edit metadata)
tasksRouter.patch('/:taskId', (req: Request<TaskParams>, res) => {
  const { action, content, metadata, displayContent, targetColumnId, targetIndex } = req.body
  const { fileId, taskId } = req.params

  const file = storage.getFile(fileId)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const { ast } = parseBoard(file.markdown)
  let newAst = ast

  switch (action) {
    case 'toggle':
      newAst = toggleTask(ast, taskId)
      break
    case 'move':
      if (!targetColumnId || targetIndex === undefined) {
        res.status(400).json({ error: 'targetColumnId and targetIndex required for move' })
        return
      }
      newAst = moveTask(ast, taskId, targetColumnId, targetIndex)
      break
    case 'updateContent':
      if (!content) {
        res.status(400).json({ error: 'content required for updateContent' })
        return
      }
      newAst = updateTaskContent(ast, taskId, content)
      break
    case 'updateMetadata':
      if (!displayContent || !metadata) {
        res.status(400).json({ error: 'displayContent and metadata required' })
        return
      }
      newAst = updateTaskMetadata(ast, taskId, displayContent, metadata as TaskMetadata)
      break
    default:
      res.status(400).json({ error: `Unknown action: ${action}` })
      return
  }

  const markdown = serializeAst(newAst)
  saveAndBroadcast(fileId, markdown)

  res.json({ ok: true })
})

// Delete a task
tasksRouter.delete('/:taskId', (req: Request<TaskParams>, res) => {
  const { fileId, taskId } = req.params

  const file = storage.getFile(fileId)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const { ast } = parseBoard(file.markdown)
  const newAst = deleteTask(ast, taskId)
  const markdown = serializeAst(newAst)

  saveAndBroadcast(fileId, markdown)

  res.status(204).send()
})
