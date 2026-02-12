import { Router, type Request } from 'express'
import {
  serializeAst,
  renameColumn,
  deleteColumn,
} from '@automd/shared'
import * as storage from '../storage.js'
import { broadcast } from '../ws.js'
import { parseBoard } from '../board-cache.js'

type ColumnParams = { fileId: string; columnId: string }

export const columnsRouter = Router({ mergeParams: true })

function saveAndBroadcast(fileId: string, markdown: string) {
  const file = storage.updateFileMarkdown(fileId, markdown)
  if (file) {
    broadcast({ type: 'file:updated', payload: { id: file.id, markdown: file.markdown } })
  }
  return file
}

// Rename a column
columnsRouter.patch('/:columnId', (req: Request<ColumnParams>, res) => {
  const { action, title } = req.body
  const { fileId, columnId } = req.params

  const file = storage.getFile(fileId)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const { ast } = parseBoard(file.markdown, fileId)

  switch (action) {
    case 'rename':
      if (!title) {
        res.status(400).json({ error: 'title required for rename' })
        return
      }
      const renamedAst = renameColumn(ast, columnId, title)
      const markdown = serializeAst(renamedAst)
      saveAndBroadcast(fileId, markdown)
      res.json({ ok: true })
      break
    default:
      res.status(400).json({ error: `Unknown action: ${action}` })
  }
})

// Delete a column
columnsRouter.delete('/:columnId', (req: Request<ColumnParams>, res) => {
  const { fileId, columnId } = req.params

  const file = storage.getFile(fileId)
  if (!file) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const { ast } = parseBoard(file.markdown, fileId)
  const newAst = deleteColumn(ast, columnId)
  const markdown = serializeAst(newAst)
  saveAndBroadcast(fileId, markdown)

  res.status(204).send()
})
