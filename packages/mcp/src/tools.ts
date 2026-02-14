import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] }
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2))
}

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const }
}

export function registerTools(server: McpServer) {
  // ─── Board Tools ─────────────────────────────────────────────────

  server.registerTool('list_boards', {
    title: 'List Boards',
    description: 'List all boards with their task counts',
  }, async () => {
    try {
      const boards = await api.listFiles()
      return json(boards)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_board', {
    title: 'Get Board',
    description: 'Get a board with its columns and tasks',
    inputSchema: { boardId: z.string().describe('The board ID') },
  }, async ({ boardId }) => {
    try {
      const board = await api.getFile(boardId)
      return json(board)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_board_markdown', {
    title: 'Get Board Markdown',
    description: 'Get the raw markdown content of a board',
    inputSchema: { boardId: z.string().describe('The board ID') },
  }, async ({ boardId }) => {
    try {
      const board = await api.getFile(boardId)
      return text(board.markdown)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('create_board', {
    title: 'Create Board',
    description: 'Create a new board. Optionally provide initial markdown content.',
    inputSchema: {
      name: z.string().describe('Name for the new board'),
      markdown: z.string().optional().describe('Initial markdown content (optional)'),
      projectId: z.string().optional().describe('Project ID to add the board to (optional)'),
    },
  }, async ({ name, markdown, projectId }) => {
    try {
      const board = await api.createFile(name, markdown, projectId)
      return json(board)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_board', {
    title: 'Delete Board',
    description: 'Permanently delete a board and all its tasks',
    inputSchema: {
      boardId: z.string().describe('The board ID to delete'),
    },
  }, async ({ boardId }) => {
    try {
      await api.deleteFile(boardId)
      return text('Board deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('rename_board', {
    title: 'Rename Board',
    description: 'Rename an existing board',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      name: z.string().describe('New name for the board'),
    },
  }, async ({ boardId, name }) => {
    try {
      const result = await api.updateFile(boardId, { name })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Task Tools ──────────────────────────────────────────────────

  server.registerTool('add_task', {
    title: 'Add Task',
    description: 'Add a new task to a column. Content supports inline metadata like @user #label priority:high due:2025-03-20 est:4h',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      columnId: z.string().describe('The column/heading ID to add the task to'),
      content: z.string().describe('Task content with optional inline metadata'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making this change (tagged as built-by)'),
    },
  }, async ({ boardId, columnId, content, agentName }) => {
    try {
      const finalContent = agentName ? `${content} built-by:${agentName}` : content
      const result = await api.addTask(boardId, columnId, finalContent)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('update_task', {
    title: 'Update Task',
    description: 'Update a task\'s content',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
      content: z.string().optional().describe('New task content'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making this change (tagged as built-by)'),
    },
  }, async ({ boardId, taskId, content, agentName }) => {
    try {
      let finalContent = content
      if (agentName && finalContent) {
        finalContent = finalContent.replace(/\s*built-by:[\w-]+/gi, '') + ` built-by:${agentName}`
      }
      const result = await api.updateTask(boardId, taskId, {
        action: 'updateContent',
        content: finalContent,
      })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('toggle_task', {
    title: 'Toggle Task',
    description: 'Toggle a task between checked and unchecked',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ boardId, taskId }) => {
    try {
      const result = await api.updateTask(boardId, taskId, { action: 'toggle' })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('move_task', {
    title: 'Move Task',
    description: 'Move a task to a different column at a specific position',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
      targetColumnId: z.string().describe('Target column ID'),
      targetIndex: z.number().describe('Position in the target column (0-based)'),
    },
  }, async ({ boardId, taskId, targetColumnId, targetIndex }) => {
    try {
      const result = await api.updateTask(boardId, taskId, {
        action: 'move',
        targetColumnId,
        targetIndex,
      })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_task', {
    title: 'Delete Task',
    description: 'Delete a task from a board',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ boardId, taskId }) => {
    try {
      await api.deleteTask(boardId, taskId)
      return text('Task deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Column Tools ────────────────────────────────────────────────

  server.registerTool('add_column', {
    title: 'Add Column',
    description: 'Add a new column (heading) to a board',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      title: z.string().describe('Column title'),
    },
  }, async ({ boardId, title }) => {
    try {
      // We need to get the board, add a column to the markdown, and update
      const board = await api.getFile(boardId)
      const newMarkdown = board.markdown.trimEnd() + `\n\n## ${title}\n\n`
      const result = await api.updateFile(boardId, { markdown: newMarkdown })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('rename_column', {
    title: 'Rename Column',
    description: 'Rename a column/heading on a board',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      columnId: z.string().describe('The column ID to rename'),
      title: z.string().describe('New title for the column'),
    },
  }, async ({ boardId, columnId, title }) => {
    try {
      const result = await api.renameColumn(boardId, columnId, title)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_column', {
    title: 'Delete Column',
    description: 'Delete a column and all its tasks from a board',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      columnId: z.string().describe('The column ID to delete'),
    },
  }, async ({ boardId, columnId }) => {
    try {
      await api.deleteColumn(boardId, columnId)
      return text('Column deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Metadata Tools ──────────────────────────────────────────────

  server.registerTool('update_task_metadata', {
    title: 'Update Task Metadata',
    description: 'Update a task\'s metadata (priority, assignees, labels, due date, estimate) without rewriting its content',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
      priority: z.enum(['high', 'medium', 'low']).nullable().optional().describe('Task priority'),
      assignees: z.array(z.string()).optional().describe('List of assignees (without @)'),
      labels: z.array(z.string()).optional().describe('List of labels (without #)'),
      dueDate: z.string().nullable().optional().describe('Due date in YYYY-MM-DD format'),
      estimate: z.number().nullable().optional().describe('Time estimate in hours'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making this change (tagged as built-by)'),
    },
  }, async ({ boardId, taskId, priority, assignees, labels, dueDate, estimate, agentName }) => {
    try {
      const board = await api.getFile(boardId)
      const task = board.columns
        .flatMap((c: { tasks: Array<{ id: string; displayContent: string; metadata: Record<string, unknown> }> }) => c.tasks)
        .find((t: { id: string }) => t.id === taskId)

      if (!task) return text('Task not found')

      const metadata = { ...task.metadata }
      if (priority !== undefined) metadata.priority = priority
      if (assignees !== undefined) metadata.assignees = assignees
      if (labels !== undefined) metadata.labels = labels
      if (dueDate !== undefined) metadata.dueDate = dueDate
      if (estimate !== undefined) metadata.estimate = estimate
      if (agentName) metadata.builtBy = agentName

      const result = await api.updateTask(boardId, taskId, {
        action: 'updateMetadata',
        displayContent: task.displayContent,
        metadata,
      })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Bulk Tools ───────────────────────────────────────────────────

  server.registerTool('bulk_update_tasks', {
    title: 'Bulk Update Tasks',
    description: 'Update multiple tasks at once. Each update can toggle, move, update content, or update metadata.',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making these changes (tagged as built-by)'),
      updates: z.array(z.object({
        taskId: z.string().describe('The task ID'),
        action: z.enum(['toggle', 'move', 'updateContent', 'updateMetadata']).describe('The action to perform'),
        content: z.string().optional().describe('New content (for updateContent)'),
        targetColumnId: z.string().optional().describe('Target column (for move)'),
        targetIndex: z.number().optional().describe('Target index (for move)'),
        displayContent: z.string().optional().describe('Display content (for updateMetadata)'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Metadata fields (for updateMetadata)'),
      })).describe('Array of task updates to apply'),
    },
  }, async ({ boardId, agentName, updates }) => {
    const results: Array<{ taskId: string; ok: boolean; error?: string }> = []

    for (const update of updates) {
      try {
        const { taskId, ...data } = update

        // Inject agentName for content/metadata updates
        if (agentName) {
          if (data.action === 'updateContent' && data.content) {
            data.content = data.content.replace(/\s*built-by:[\w-]+/gi, '') + ` built-by:${agentName}`
          }
          if (data.action === 'updateMetadata' && data.metadata) {
            data.metadata = { ...data.metadata, builtBy: agentName }
          }
        }

        await api.updateTask(boardId, taskId, data)
        results.push({ taskId, ok: true })
      } catch (err) {
        results.push({
          taskId: update.taskId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return json({
      total: updates.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    })
  })

  // ─── Search Tools ────────────────────────────────────────────────

  server.registerTool('search_tasks', {
    title: 'Search Tasks',
    description: 'Search for tasks across all boards by text, assignee, label, or status',
    inputSchema: {
      query: z.string().optional().describe('Text to search for in task content'),
      assignee: z.string().optional().describe('Filter by assignee (without @)'),
      label: z.string().optional().describe('Filter by label (without #)'),
      checked: z.boolean().optional().describe('Filter by completion status'),
    },
  }, async ({ query, assignee, label, checked }) => {
    try {
      const boards = await api.listFiles()
      const results: Array<{
        boardId: string
        boardName: string
        taskId: string
        content: string
        column: string
        checked: boolean
      }> = []

      for (const boardSummary of boards) {
        try {
          const board = await api.getFile(boardSummary.id)
          for (const column of board.columns) {
            for (const task of column.tasks) {
              let match = true
              if (query && !task.content.toLowerCase().includes(query.toLowerCase())) match = false
              if (assignee && !task.metadata.assignees.includes(assignee)) match = false
              if (label && !task.metadata.labels.includes(label)) match = false
              if (checked !== undefined && task.checked !== checked) match = false

              if (match) {
                results.push({
                  boardId: boardSummary.id,
                  boardName: boardSummary.name,
                  taskId: task.id,
                  content: task.content,
                  column: column.title,
                  checked: task.checked,
                })
              }
            }
          }
        } catch (err) {
          // Skip boards that fail to load, continue searching others
          console.error(`[mcp] Failed to search board ${boardSummary.id}:`, err)
        }
      }

      return json({ count: results.length, results })
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Project Tools ───────────────────────────────────────────────

  server.registerTool('list_projects', {
    title: 'List Projects',
    description: 'List all projects',
  }, async () => {
    try {
      const projects = await api.listProjects()
      return json(projects)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_project_boards', {
    title: 'Get Project Boards',
    description: 'List all boards belonging to a project',
    inputSchema: {
      projectId: z.string().describe('The project ID'),
    },
  }, async ({ projectId }) => {
    try {
      const allBoards = await api.listFiles()
      const projectBoards = allBoards.filter(
        (b: { projectId: string | null }) => b.projectId === projectId,
      )
      return json(projectBoards)
    } catch (err) {
      return errorResponse(err)
    }
  })
}
