import { Router, type Request } from 'express'
import {
  serializeAst,
  renameColumn,
  deleteColumn,
} from '@automd/shared'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { withWriteLock } from '../write-lock.js'
import { isValidId } from '../validation.js'
import { parseBoard, invalidateBoardCache } from '../board-cache.js'
import { dispatchWebhookEvent } from '../webhook-delivery.js'

type ColumnParams = { fileId: string; columnId: string }

export const columnsRouter = Router({ mergeParams: true })

function saveFile(fileId: string, markdown: string) {
  invalidateBoardCache(fileId)
  return storage.updateFileMarkdown(fileId, markdown)
}

// Rename a column
columnsRouter.patch('/:columnId', async (req: Request<ColumnParams>, res, next) => {
  if (!isValidId(req.params.fileId) || !isValidId(req.params.columnId)) {
    res.status(400).json({ error: 'Invalid ID format' })
    return
  }

  const { action, title } = req.body
  const { fileId, columnId } = req.params

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(fileId)
      if (!file) return { status: 404 as const }

      const ifMatch = req.headers['if-match']
      if (ifMatch && ifMatch !== `"${file.updatedAt}"`) {
        return { status: 409 as const, currentVersion: file.updatedAt }
      }

      const { ast } = parseBoard(file.markdown, fileId)

      switch (action) {
        case 'rename':
          if (!title) {
            return { status: 400 as const, error: 'title required for rename' }
          }
          if (typeof title !== 'string' || title.length > 200) {
            return { status: 400 as const, error: 'title must be 200 characters or less' }
          }
          const renamedAst = renameColumn(ast, columnId, title)
          const markdown = serializeAst(renamedAst)
          const savedFile = saveFile(fileId, markdown)
          return { status: 200 as const, file: savedFile }
        default:
          return { status: 400 as const, error: `Unknown action: ${action}` }
      }
    })

    if (result.status === 404) {
      res.status(404).json({ error: 'Board not found' })
    } else if (result.status === 400) {
      res.status(400).json({ error: result.error })
    } else if (result.status === 409) {
      res.status(409).json({ error: 'Conflict: board was modified', currentVersion: result.currentVersion })
    } else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        dispatchWebhookEvent('board.updated', { boardId: result.file.id, boardName: result.file.name })
      }
      res.json({ ok: true })
    }
  } catch (err) {
    next(err)
  }
})

// Delete a column
columnsRouter.delete('/:columnId', async (req: Request<ColumnParams>, res, next) => {
  if (!isValidId(req.params.fileId) || !isValidId(req.params.columnId)) {
    res.status(400).json({ error: 'Invalid ID format' })
    return
  }

  const { fileId, columnId } = req.params

  try {
    const result = await withWriteLock(() => {
      const file = storage.getFile(fileId)
      if (!file) return { status: 404 as const }

      const ifMatch = req.headers['if-match']
      if (ifMatch && ifMatch !== `"${file.updatedAt}"`) {
        return { status: 409 as const, currentVersion: file.updatedAt }
      }

      const { ast } = parseBoard(file.markdown, fileId)
      const newAst = deleteColumn(ast, columnId)
      const markdown = serializeAst(newAst)
      const savedFile = saveFile(fileId, markdown)

      return { status: 204 as const, file: savedFile }
    })

    if (result.status === 404) {
      res.status(404).json({ error: 'Board not found' })
    } else if (result.status === 409) {
      res.status(409).json({ error: 'Conflict: board was modified', currentVersion: result.currentVersion })
    } else {
      if (result.file) {
        broadcast({ type: 'file:updated', payload: { id: result.file.id, markdown: result.file.markdown } })
        dispatchWebhookEvent('board.updated', { boardId: result.file.id, boardName: result.file.name })
      }
      res.status(204).send()
    }
  } catch (err) {
    next(err)
  }
})
