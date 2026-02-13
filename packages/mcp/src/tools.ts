import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] }
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2))
}

export function registerTools(server: McpServer) {
  // ─── Board Tools ─────────────────────────────────────────────────

  server.registerTool('list_boards', {
    title: 'List Boards',
    description: 'List all boards with their task counts',
  }, async () => {
    const boards = await api.listFiles()
    return json(boards)
  })

  server.registerTool('get_board', {
    title: 'Get Board',
    description: 'Get a board with its columns and tasks',
    inputSchema: { boardId: z.string().describe('The board ID') },
  }, async ({ boardId }) => {
    const board = await api.getFile(boardId)
    return json(board)
  })

  server.registerTool('get_board_markdown', {
    title: 'Get Board Markdown',
    description: 'Get the raw markdown content of a board',
    inputSchema: { boardId: z.string().describe('The board ID') },
  }, async ({ boardId }) => {
    const board = await api.getFile(boardId)
    return text(board.markdown)
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
    const board = await api.createFile(name, markdown, projectId)
    return json(board)
  })

  // ─── Task Tools ──────────────────────────────────────────────────

  server.registerTool('add_task', {
    title: 'Add Task',
    description: 'Add a new task to a column. Content supports inline metadata like @user #label priority:high due:2025-03-20 est:4h',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      columnId: z.string().describe('The column/heading ID to add the task to'),
      content: z.string().describe('Task content with optional inline metadata'),
    },
  }, async ({ boardId, columnId, content }) => {
    const result = await api.addTask(boardId, columnId, content)
    return json(result)
  })

  server.registerTool('update_task', {
    title: 'Update Task',
    description: 'Update a task\'s content or metadata',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
      content: z.string().optional().describe('New task content'),
    },
  }, async ({ boardId, taskId, content }) => {
    const result = await api.updateTask(boardId, taskId, {
      action: 'updateContent',
      content,
    })
    return json(result)
  })

  server.registerTool('toggle_task', {
    title: 'Toggle Task',
    description: 'Toggle a task between checked and unchecked',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ boardId, taskId }) => {
    const result = await api.updateTask(boardId, taskId, { action: 'toggle' })
    return json(result)
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
    const result = await api.updateTask(boardId, taskId, {
      action: 'move',
      targetColumnId,
      targetIndex,
    })
    return json(result)
  })

  server.registerTool('delete_task', {
    title: 'Delete Task',
    description: 'Delete a task from a board',
    inputSchema: {
      boardId: z.string().describe('The board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ boardId, taskId }) => {
    await api.deleteTask(boardId, taskId)
    return text('Task deleted')
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
    // We need to get the board, add a column to the markdown, and update
    const board = await api.getFile(boardId)
    const newMarkdown = board.markdown.trimEnd() + `\n\n## ${title}\n\n`
    const result = await api.updateFile(boardId, { markdown: newMarkdown })
    return json(result)
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
    }

    return json({ count: results.length, results })
  })

  // ─── Project Tools ───────────────────────────────────────────────

  server.registerTool('list_projects', {
    title: 'List Projects',
    description: 'List all projects',
  }, async () => {
    const projects = await api.listProjects()
    return json(projects)
  })

  server.registerTool('get_project_boards', {
    title: 'Get Project Boards',
    description: 'List all boards belonging to a project',
    inputSchema: {
      projectId: z.string().describe('The project ID'),
    },
  }, async ({ projectId }) => {
    const allBoards = await api.listFiles()
    const projectBoards = allBoards.filter(
      (b: { projectId: string | null }) => b.projectId === projectId
    )
    return json(projectBoards)
  })
}
