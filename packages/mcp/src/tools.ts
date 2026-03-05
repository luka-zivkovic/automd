import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'

/** Lightweight types matching server API response shapes */
interface ApiTask {
  id: string
  content: string
  displayContent: string
  checked: boolean | null
  metadata: Record<string, unknown> & {
    assignees: string[]
    labels: string[]
    archived?: boolean
    completedAt?: string | null
    knowledge?: boolean
    builtBy?: string | null
  }
  description: string | null
  acceptanceCriteria: string | null
  learnings: string | null
}

interface ApiColumn {
  id: string
  title: string
  tasks: ApiTask[]
}

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
  // ─── Item Tools ─────────────────────────────────────────────────

  server.registerTool('list_items', {
    title: 'List Items',
    description: 'List all items (boards, checklists, pages, and knowledge bases) with their task counts. Returns array of {id, name, itemType, projectId, taskCount}.',
  }, async () => {
    try {
      const items = await api.listFiles()
      return json(items)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_item', {
    title: 'Get Item',
    description: 'Get an item (board, checklist, page, or knowledge base) with its columns and tasks',
    inputSchema: { itemId: z.string().describe('The item ID (obtain from list_items)') },
  }, async ({ itemId }) => {
    try {
      const item = await api.getFile(itemId)
      return json(item)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_item_markdown', {
    title: 'Get Item Markdown',
    description: 'Get the raw markdown content of an item (board, checklist, or page)',
    inputSchema: { itemId: z.string().describe('The item ID') },
  }, async ({ itemId }) => {
    try {
      const item = await api.getFile(itemId)
      return text(item.markdown)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('create_item', {
    title: 'Create Item',
    description: 'Create a new board, checklist, page, or knowledge base. Boards use # (H1) for columns and ## (H2) for tasks. Checklists use ## (H2) with [ ]/[x] prefixes. Pages are free-form markdown. Knowledge bases are structured collections of entries (## H2) without checkboxes or progress — ideal for decisions, patterns, and reference material. All support YAML frontmatter, descriptions, blockquotes (>) for acceptance criteria, and GFM checkboxes for subtasks.',
    inputSchema: {
      name: z.string().describe('Name for the new item'),
      itemType: z.enum(['board', 'checklist', 'page', 'knowledge']).optional().describe('Type of item to create: board (kanban columns), checklist (task list with checkboxes), page (free-form markdown), or knowledge (structured entries without checkboxes/progress). Defaults to board'),
      markdown: z.string().optional().describe('Initial markdown content. Omit for an empty item. For boards: use # for columns, ## for tasks. For checklists: ## with [ ] prefix. For pages/knowledge: free-form markdown. All types support YAML frontmatter (board:, description:, vocabulary:).'),
      projectId: z.string().optional().describe('Project ID to add the item to (optional)'),
    },
  }, async ({ name, itemType, markdown, projectId }) => {
    try {
      const item = await api.createFile(name, markdown, projectId, itemType)
      return json(item)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_item', {
    title: 'Delete Item',
    description: 'Permanently delete an item (board, checklist, or page) and all its contents',
    inputSchema: {
      itemId: z.string().describe('The item ID to delete'),
    },
  }, async ({ itemId }) => {
    try {
      await api.deleteFile(itemId)
      return text('Item deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('rename_item', {
    title: 'Rename Item',
    description: 'Rename an existing item (board, checklist, or page)',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      name: z.string().describe('New name for the item'),
    },
  }, async ({ itemId, name }) => {
    try {
      const result = await api.updateFile(itemId, { name })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Task Tools ──────────────────────────────────────────────────

  server.registerTool('add_task', {
    title: 'Add Task',
    description: 'Add a new task (## H2 heading) to a column. Content supports inline metadata: @user #label priority:high|medium|low due:YYYY-MM-DD est:4h knowledge:true. Do not include built-by: manually — use the agentName parameter.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      columnId: z.string().describe('The column ID (found in get_item response columns[].id)'),
      content: z.string().describe('Task content with optional inline metadata'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making this change (tagged as built-by)'),
    },
  }, async ({ itemId, columnId, content, agentName }) => {
    try {
      const finalContent = agentName ? `${content} built-by:${agentName}` : content
      const result = await api.addTask(itemId, columnId, finalContent)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('update_task', {
    title: 'Update Task',
    description: 'Update a task\'s title/content text only. For metadata use update_task_metadata, for completion use toggle_task, for position use move_task, for AC use update_acceptance_criteria, for learnings use update_learnings.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID (found in get_item response columns[].tasks[].id)'),
      content: z.string().optional().describe('New task content'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making this change (tagged as built-by)'),
    },
  }, async ({ itemId, taskId, content, agentName }) => {
    try {
      let finalContent = content
      if (agentName && finalContent) {
        finalContent = finalContent.replace(/\s*built-by:[\w-]+/gi, '') + ` built-by:${agentName}`
      }
      const result = await api.updateTask(itemId, taskId, {
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
    description: 'Toggle a task between checked [ ] and unchecked [x]. Only applies to tasks with checkbox prefixes. Sets completedAt on check, clears on uncheck.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      const result = await api.updateTask(itemId, taskId, { action: 'toggle' })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('move_task', {
    title: 'Move Task',
    description: 'Move a task to a different column at a specific position',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
      targetColumnId: z.string().describe('Target column ID'),
      targetIndex: z.number().describe('Position in target column (0-based). Use 0 to place at top. To append, use the column task count from get_item.'),
    },
  }, async ({ itemId, taskId, targetColumnId, targetIndex }) => {
    try {
      const result = await api.updateTask(itemId, taskId, {
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
    description: 'Delete a task from an item',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      await api.deleteTask(itemId, taskId)
      return text('Task deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Column Tools ────────────────────────────────────────────────

  server.registerTool('add_column', {
    title: 'Add Column',
    description: 'Add a new column (# H1 heading) to a board or checklist. Columns group tasks into workflow stages like "To Do", "In Progress", "Done".',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      title: z.string().describe('Column title'),
    },
  }, async ({ itemId, title }) => {
    try {
      const item = await api.getFile(itemId)
      const newMarkdown = item.markdown.trimEnd() + `\n\n# ${title}\n\n`
      const result = await api.updateFile(itemId, { markdown: newMarkdown })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('rename_column', {
    title: 'Rename Column',
    description: 'Rename a column/heading on an item',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      columnId: z.string().describe('The column ID to rename'),
      title: z.string().describe('New title for the column'),
    },
  }, async ({ itemId, columnId, title }) => {
    try {
      const result = await api.renameColumn(itemId, columnId, title)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_column', {
    title: 'Delete Column',
    description: 'Delete a column and all its tasks from an item',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      columnId: z.string().describe('The column ID to delete'),
    },
  }, async ({ itemId, columnId }) => {
    try {
      await api.deleteColumn(itemId, columnId)
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
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
      priority: z.enum(['high', 'medium', 'low']).nullable().optional().describe('Task priority'),
      assignees: z.array(z.string()).optional().describe('List of assignees (without @)'),
      labels: z.array(z.string()).optional().describe('List of labels (without #)'),
      dueDate: z.string().nullable().optional().describe('Due date in YYYY-MM-DD format'),
      estimate: z.number().nullable().optional().describe('Time estimate in hours'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making this change (tagged as built-by)'),
    },
  }, async ({ itemId, taskId, priority, assignees, labels, dueDate, estimate, agentName }) => {
    try {
      const item = await api.getFile(itemId)
      const task = item.columns
        .flatMap((c: ApiColumn) => c.tasks)
        .find((t: ApiTask) => t.id === taskId)

      if (!task) return text('Task not found')

      const metadata = { ...task.metadata }
      if (priority !== undefined) metadata.priority = priority
      if (assignees !== undefined) metadata.assignees = assignees
      if (labels !== undefined) metadata.labels = labels
      if (dueDate !== undefined) metadata.dueDate = dueDate
      if (estimate !== undefined) metadata.estimate = estimate
      if (agentName) metadata.builtBy = agentName

      const result = await api.updateTask(itemId, taskId, {
        action: 'updateMetadata',
        displayContent: task.displayContent,
        metadata,
      })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('update_acceptance_criteria', {
    title: 'Update Acceptance Criteria',
    description: 'Update a task\'s acceptance criteria (rendered as blockquotes in markdown). These are testable conditions that define "done" for a task. Each line becomes a separate blockquote line.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
      acceptanceCriteria: z.string().nullable().describe('Acceptance criteria text. Each line becomes a blockquote entry. Pass null to remove AC.'),
    },
  }, async ({ itemId, taskId, acceptanceCriteria }) => {
    try {
      const result = await api.updateTask(itemId, taskId, {
        action: 'updateAcceptanceCriteria',
        acceptanceCriteria,
      })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('update_learnings', {
    title: 'Update Learnings',
    description: 'Update a completed task\'s learnings section (rendered as ### Learnings with a bullet list in markdown). Use this to record decisions, insights, and pitfalls discovered while completing a task. Supports #label tags for cross-referencing.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
      learnings: z.string().nullable().describe('Learnings text. Each line becomes a bullet point under ### Learnings. Use #tags for keywords (e.g. "PKCE flow required for SPA #oauth #security"). Pass null to remove.'),
    },
  }, async ({ itemId, taskId, learnings }) => {
    try {
      const result = await api.updateTask(itemId, taskId, {
        action: 'updateLearnings',
        learnings,
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
      itemId: z.string().describe('The item ID'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Name of the agent making these changes (tagged as built-by)'),
      updates: z.array(z.object({
        taskId: z.string().describe('The task ID'),
        action: z.enum(['toggle', 'move', 'updateContent', 'updateMetadata', 'updateAcceptanceCriteria', 'updateLearnings']).describe('The action to perform'),
        content: z.string().optional().describe('New content (for updateContent)'),
        targetColumnId: z.string().optional().describe('Target column (for move)'),
        targetIndex: z.number().optional().describe('Target index (for move)'),
        displayContent: z.string().optional().describe('Display content (for updateMetadata)'),
        metadata: z.record(z.string(), z.unknown()).optional().describe('Metadata fields (for updateMetadata)'),
        acceptanceCriteria: z.string().nullable().optional().describe('Acceptance criteria text (for updateAcceptanceCriteria). Pass null to remove.'),
        learnings: z.string().nullable().optional().describe('Learnings text (for updateLearnings). Pass null to remove.'),
      })).describe('Array of task updates to apply'),
    },
  }, async ({ itemId, agentName, updates }) => {
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

        await api.updateTask(itemId, taskId, data)
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
    description: 'Search for tasks across all items by text, assignee, label, or status',
    inputSchema: {
      query: z.string().optional().describe('Text to search for in task content'),
      assignee: z.string().optional().describe('Filter by assignee (without @)'),
      label: z.string().optional().describe('Filter by label (without #)'),
      checked: z.boolean().optional().describe('Filter by completion status'),
    },
  }, async ({ query, assignee, label, checked }) => {
    try {
      const items = await api.listFiles()
      const results: Array<{
        itemId: string
        itemName: string
        taskId: string
        content: string
        column: string
        checked: boolean | null
      }> = []

      for (const itemSummary of items) {
        try {
          const item = await api.getFile(itemSummary.id)
          for (const column of item.columns) {
            for (const task of column.tasks) {
              let match = true
              if (query && !task.content.toLowerCase().includes(query.toLowerCase())) match = false
              if (assignee && !task.metadata.assignees.includes(assignee)) match = false
              if (label && !task.metadata.labels.includes(label)) match = false
              if (checked !== undefined && task.checked !== checked) match = false

              if (match) {
                results.push({
                  itemId: itemSummary.id,
                  itemName: itemSummary.name,
                  taskId: task.id,
                  content: task.content,
                  column: column.title,
                  checked: task.checked,
                })
              }
            }
          }
        } catch (err) {
          console.error(`[mcp] Failed to search item ${itemSummary.id}:`, err)
        }
      }

      return json({ count: results.length, results })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('search_context', {
    title: 'Search Context',
    description: 'Search for contextual detail (descriptions, acceptance criteria, learnings) across all items. Returns any task with rich content — broader than find_knowledge which only returns knowledge:true items. Use this for finding implementation details, past decisions, and context before starting work.',
    inputSchema: {
      query: z.string().optional().describe('Text to search for across descriptions, AC, learnings, and task content'),
      label: z.string().optional().describe('Filter by label (without #). Also matches #tags inside learnings text.'),
      completedOnly: z.boolean().optional().describe('Only return completed tasks (default: false). Useful for finding learnings from done work.'),
    },
  }, async ({ query, label, completedOnly }) => {
    try {
      const items = await api.listFiles()
      const results: Array<{
        itemId: string
        itemName: string
        taskId: string
        taskTitle: string
        taskLabels: string[]
        column: string
        checked: boolean | null
        description: string | null
        acceptanceCriteria: string | null
        learnings: string | null
      }> = []

      const q = query?.toLowerCase()

      for (const itemSummary of items) {
        try {
          const item = await api.getFile(itemSummary.id)
          for (const column of item.columns) {
            for (const task of column.tasks) {
              if (completedOnly && !task.checked) continue

              // Build searchable text from all fields
              const searchable = [
                task.content,
                task.description,
                task.acceptanceCriteria,
                task.learnings,
              ].filter(Boolean).join(' ').toLowerCase()

              let match = true
              if (q && !searchable.includes(q)) match = false
              if (label) {
                // Check task labels AND inline #tags in learnings
                const hasLabel = task.metadata.labels.includes(label)
                const hasInlineLabelTag = searchable.includes(`#${label.toLowerCase()}`)
                if (!hasLabel && !hasInlineLabelTag) match = false
              }

              // Only include results that have some knowledge content
              const hasContext = task.description || task.acceptanceCriteria || task.learnings
              if (!hasContext) match = false

              if (match) {
                results.push({
                  itemId: itemSummary.id,
                  itemName: itemSummary.name,
                  taskId: task.id,
                  taskTitle: task.displayContent,
                  taskLabels: task.metadata.labels,
                  column: column.title,
                  checked: task.checked,
                  description: task.description,
                  acceptanceCriteria: task.acceptanceCriteria,
                  learnings: task.learnings,
                })
              }
            }
          }
        } catch (err) {
          console.error(`[mcp] Failed to search item ${itemSummary.id}:`, err)
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
    description: 'List all projects. Returns array of {id, name, color}. Use project id as projectId in create_item or get_project_items.',
  }, async () => {
    try {
      const projects = await api.listProjects()
      return json(projects)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_project_items', {
    title: 'Get Project Items',
    description: 'List all items (boards, checklists, pages) belonging to a project',
    inputSchema: {
      projectId: z.string().describe('The project ID'),
    },
  }, async ({ projectId }) => {
    try {
      const allItems = await api.listFiles()
      const projectItems = allItems.filter(
        (b: { projectId: string | null }) => b.projectId === projectId,
      )
      return json(projectItems)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('create_project', {
    title: 'Create Project',
    description: 'Create a new project to organize items',
    inputSchema: {
      name: z.string().describe('Name for the new project (max 200 characters)'),
      color: z.string().optional().describe('Hex color for the project (default: #3b82f6)'),
    },
  }, async ({ name, color }) => {
    try {
      const project = await api.createProject(name, color)
      return json(project)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Knowledge Tools ──────────────────────────────────────────────

  server.registerTool('add_knowledge', {
    title: 'Add Knowledge',
    description: 'Add a knowledge item. Knowledge items are tasks with knowledge:true — they store decisions, patterns, references, and institutional memory. They reuse the task infrastructure but skip the checkbox/completion workflow.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      columnId: z.string().describe('The column ID'),
      content: z.string().describe('Knowledge item title (e.g. "Always use parameterized queries for SQL")'),
      description: z.string().optional().describe('Detailed description/context for this knowledge item'),
      learnings: z.string().optional().describe('Key learnings as bullet points (newline-separated). Supports #tags.'),
      labels: z.array(z.string()).optional().describe('Labels for categorization (e.g. ["security", "database"])'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Agent name to tag with built-by:'),
    },
  }, async ({ itemId, columnId, content, description, learnings, labels, agentName }) => {
    try {
      // 1. Build content with knowledge:true flag
      let taskContent = `${content} knowledge:true`
      if (labels?.length) taskContent += ' ' + labels.map(l => `#${l}`).join(' ')
      if (agentName) taskContent += ` built-by:${agentName}`

      const result = await api.addTask(itemId, columnId, taskContent)

      // 2. Add description if provided
      if (description && result?.taskId) {
        await api.updateTask(itemId, result.taskId, {
          action: 'updateDescription',
          description,
        })
      }

      // 3. Add learnings if provided
      if (learnings && result?.taskId) {
        await api.updateTask(itemId, result.taskId, {
          action: 'updateLearnings',
          learnings,
        })
      }

      return json({ ...result, knowledge: true })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('update_knowledge', {
    title: 'Update Knowledge',
    description: 'Update an existing knowledge item\'s description, learnings, or labels.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task/knowledge item ID'),
      description: z.string().optional().describe('New description (replaces existing)'),
      learnings: z.string().optional().describe('New learnings (replaces existing). Supports #tags.'),
      labels: z.array(z.string()).optional().describe('New labels (replaces existing)'),
    },
  }, async ({ itemId, taskId, description, learnings, labels }) => {
    try {
      const results: string[] = []

      if (description !== undefined) {
        await api.updateTask(itemId, taskId, {
          action: 'updateDescription',
          description,
        })
        results.push('description updated')
      }

      if (learnings !== undefined) {
        await api.updateTask(itemId, taskId, {
          action: 'updateLearnings',
          learnings,
        })
        results.push('learnings updated')
      }

      if (labels !== undefined) {
        // Fetch current task to preserve displayContent
        const item = await api.getFile(itemId)
        const allTasks = item.columns.flatMap((c: ApiColumn) => c.tasks)
        const task = allTasks.find((t: ApiTask) => t.id === taskId)
        if (task) {
          await api.updateTask(itemId, taskId, {
            action: 'updateMetadata',
            displayContent: task.displayContent,
            metadata: { ...task.metadata, labels },
          })
          results.push('labels updated')
        }
      }

      return json({ ok: true, updated: results })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('find_knowledge', {
    title: 'Find Knowledge',
    description: 'Search specifically for curated knowledge items (knowledge:true) and tasks with captured learnings. Use for institutional decisions, patterns, and reference. For broader task history including descriptions, use search_context instead.',
    inputSchema: {
      query: z.string().optional().describe('Text to search for in knowledge items'),
      label: z.string().optional().describe('Filter by label (without #)'),
    },
  }, async ({ query, label }) => {
    try {
      const items = await api.listFiles()
      const results: Array<{
        itemId: string
        itemName: string
        taskId: string
        title: string
        labels: string[]
        description: string | null
        learnings: string | null
        column: string
      }> = []

      const q = query?.toLowerCase()

      for (const itemSummary of items) {
        try {
          const item = await api.getFile(itemSummary.id)
          for (const column of item.columns) {
            for (const task of column.tasks) {
              // Must be knowledge:true OR have learnings
              const isKnowledge = task.metadata?.knowledge === true
              const hasLearnings = !!task.learnings
              if (!isKnowledge && !hasLearnings) continue

              // Apply text filter
              if (q) {
                const searchable = [
                  task.content, task.description,
                  task.acceptanceCriteria, task.learnings,
                ].filter(Boolean).join(' ').toLowerCase()
                if (!searchable.includes(q)) continue
              }

              // Apply label filter
              if (label) {
                const hasLabel = task.metadata?.labels?.includes(label)
                const hasInlineTag = task.learnings?.toLowerCase().includes(`#${label.toLowerCase()}`)
                if (!hasLabel && !hasInlineTag) continue
              }

              results.push({
                itemId: itemSummary.id,
                itemName: itemSummary.name,
                taskId: task.id,
                title: task.displayContent,
                labels: task.metadata?.labels ?? [],
                description: task.description,
                learnings: task.learnings,
                column: column.title,
              })
            }
          }
        } catch (err) {
          console.error(`[mcp] Failed to search item ${itemSummary.id}:`, err)
        }
      }

      return json({ count: results.length, results })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('synthesize_topic', {
    title: 'Synthesize Topic',
    description: 'Gather all knowledge about a topic and return a structured summary. This collects and organizes existing knowledge items — it does NOT generate AI content. Returns a paste-ready context brief.',
    inputSchema: {
      topic: z.string().describe('Topic to synthesize knowledge about (e.g. "authentication", "pricing", "deployment")'),
      labels: z.string().optional().describe('Comma-separated labels to filter by (e.g. "backend,security"). Unlike label on other tools which takes a single value, this accepts multiple comma-separated.'),
    },
  }, async ({ topic, labels }) => {
    try {
      const result = await api.getContext({ topic, labels, limit: 50 })
      return text(result.context)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('import_memories', {
    title: 'Import Memories',
    description: 'Bulk import knowledge items from external sources (AI conversation logs, meeting notes, etc.). Creates knowledge:true tasks for each item.',
    inputSchema: {
      itemId: z.string().describe('The item ID to import into'),
      columnId: z.string().describe('The column ID to add items to'),
      items: z.array(z.object({
        content: z.string().describe('Knowledge item title'),
        description: z.string().optional().describe('Detailed description'),
        learnings: z.string().optional().describe('Key learnings'),
        labels: z.array(z.string()).optional().describe('Labels for categorization'),
      })).describe('Array of knowledge items to import'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Agent name to tag imports with'),
    },
  }, async ({ itemId, columnId, items, agentName }) => {
    try {
      const results: Array<{ content: string; taskId: string }> = []
      const errors: string[] = []

      for (const item of items) {
        try {
          let taskContent = `${item.content} knowledge:true`
          if (item.labels?.length) taskContent += ' ' + item.labels.map(l => `#${l}`).join(' ')
          if (agentName) taskContent += ` built-by:${agentName}`

          const result = await api.addTask(itemId, columnId, taskContent)

          if (item.description && result?.taskId) {
            await api.updateTask(itemId, result.taskId, {
              action: 'updateDescription',
              description: item.description,
            })
          }

          if (item.learnings && result?.taskId) {
            await api.updateTask(itemId, result.taskId, {
              action: 'updateLearnings',
              learnings: item.learnings,
            })
          }

          results.push({ content: item.content, taskId: result.taskId })
        } catch (err) {
          errors.push(`Failed to import "${item.content}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return json({
        imported: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('archive_completed_tasks', {
    title: 'Archive Completed Tasks',
    description: 'Bulk archive completed tasks. Optionally filter by age (days since completion) or column.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      olderThanDays: z.number().optional().describe('Only archive tasks completed more than N days ago'),
      columnId: z.string().optional().describe('Only archive tasks in this column'),
    },
  }, async ({ itemId, olderThanDays, columnId }) => {
    try {
      const item = await api.getFile(itemId)
      const now = new Date()
      let archived = 0
      const errors: string[] = []

      for (const column of item.columns as ApiColumn[]) {
        if (columnId && column.id !== columnId) continue

        for (const task of column.tasks) {
          if (!task.checked) continue
          if (task.metadata?.archived) continue

          // Check age filter
          if (olderThanDays !== undefined) {
            if (!task.metadata?.completedAt) continue
            const completedDate = new Date(task.metadata.completedAt)
            if (isNaN(completedDate.getTime())) continue
            const daysSince = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
            if (daysSince < olderThanDays) continue
          }

          try {
            await api.updateTask(itemId, task.id, {
              action: 'updateMetadata',
              displayContent: task.displayContent,
              metadata: { ...task.metadata, archived: true },
            })
            archived++
          } catch (err) {
            errors.push(`Failed to archive "${task.displayContent}": ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }

      return json({
        archived,
        errors: errors.length > 0 ? errors : undefined,
      })
    } catch (err) {
      return errorResponse(err)
    }
  })
}
