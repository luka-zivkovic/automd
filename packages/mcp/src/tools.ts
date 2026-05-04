import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'
import { tokenizeForSearch, computeScore } from './text-search-utils.js'
import { findDuplicates, type ExistingKnowledgeItem } from './text-similarity.js'

// ─── Embeddings capability detection ────────────────────────────────────

let _serverHasSearch: boolean | null = null
let _searchCheckedAt = 0
const SEARCH_CHECK_TTL_MS = 60_000 // Re-check every 60s

async function serverHasSearch(): Promise<boolean> {
  const now = Date.now()
  if (_serverHasSearch !== null && (now - _searchCheckedAt) < SEARCH_CHECK_TTL_MS) {
    return _serverHasSearch
  }
  try {
    const health = await api.health() as { embeddings?: { enabled: boolean } }
    _serverHasSearch = !!health.embeddings?.enabled
  } catch {
    _serverHasSearch = false
  }
  _searchCheckedAt = now
  return _serverHasSearch
}

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
  children?: ApiTask[]
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

/** Collect all existing knowledge items across all boards for dedup checks */
async function collectExistingKnowledge(): Promise<{ items: ExistingKnowledgeItem[]; errors: string[] }> {
  const files = await api.listFiles()
  const existing: ExistingKnowledgeItem[] = []
  const errors: string[] = []

  for (const fileSummary of files) {
    try {
      const item = await api.getFile(fileSummary.id)
      for (const column of item.columns) {
        for (const task of flattenApiTasks(column.tasks)) {
          if (task.metadata?.knowledge === true || task.learnings) {
            existing.push({
              taskId: task.id,
              itemId: fileSummary.id,
              title: task.displayContent,
              description: task.description,
            })
          }
        }
      }
    } catch (err) {
      const msg = `Failed to load item ${fileSummary.id}: ${err instanceof Error ? err.message : String(err)}`
      console.error(`[mcp] ${msg}`)
      errors.push(msg)
    }
  }

  return { items: existing, errors }
}

/** Flatten API tasks including children */
function flattenApiTasks(tasks: ApiTask[]): ApiTask[] {
  const result: ApiTask[] = []
  const stack = [...tasks]
  while (stack.length > 0) {
    const task = stack.pop()!
    result.push(task)
    if (task.children) {
      for (let i = task.children.length - 1; i >= 0; i--) {
        stack.push(task.children[i])
      }
    }
  }
  return result
}

export function registerTools(server: McpServer) {
  // ─── Item Tools ─────────────────────────────────────────────────

  server.registerTool('list_items', {
    title: 'List Items',
    description: 'List all items with task counts and progress. Default includes column summaries; pass brief=true for just IDs, names, types, and counts.',
    inputSchema: {
      brief: z.boolean().optional().describe('Return minimal fields only: id, name, itemType, taskCount, progress (default: false)'),
    },
  }, async ({ brief }) => {
    try {
      const items = await api.listFiles()
      if (brief) {
        const briefItems = items.map((item: any) => ({
          id: item.id,
          name: item.name,
          itemType: item.itemType,
          taskCount: item.taskCount,
          progress: item.progress,
        }))
        return json(briefItems)
      }
      return json(items)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_item', {
    title: 'Get Item',
    description: 'Get an item with tiered detail levels to control token usage. L0: summary only (column names, task counts, progress). L1: tasks with titles + metadata (no descriptions/AC/learnings/markdown). L2: full content including markdown, descriptions, AC, learnings, children. Default: L1.',
    inputSchema: {
      itemId: z.string().describe('The item ID (obtain from list_items)'),
      detail: z.enum(['L0', 'L1', 'L2']).optional().describe('Detail level: L0 (summary), L1 (tasks+metadata, default), L2 (full content with descriptions/AC/learnings/markdown)'),
    },
  }, async ({ itemId, detail }) => {
    try {
      const item = await api.getFile(itemId, detail ?? 'L1')
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
      const item = await api.getFile(itemId, 'L2')
      return text(item.markdown)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_task_detail', {
    title: 'Get Task Detail',
    description: 'Get full detail for a single task including description, acceptance criteria, learnings, subtasks, and all metadata. Use this after search/context tools return compact results and you need the full picture for a specific task.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      const item = await api.getFile(itemId, 'L2')
      const allTasks = item.columns.flatMap((c: ApiColumn) => flattenApiTasks(c.tasks))
      const task = allTasks.find((t: ApiTask) => t.id === taskId)
      if (!task) return errorResponse(new Error('Task not found'))
      const column = item.columns.find((c: ApiColumn) =>
        flattenApiTasks(c.tasks).some((t: ApiTask) => t.id === taskId)
      )
      return json({
        itemId,
        itemName: item.name,
        taskId: task.id,
        title: task.displayContent,
        content: task.content,
        checked: task.checked,
        metadata: task.metadata,
        description: task.description,
        acceptanceCriteria: task.acceptanceCriteria,
        learnings: task.learnings,
        children: task.children,
        column: column?.title ?? '',
      })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_my_tasks', {
    title: 'Get My Tasks',
    description: 'List tasks claimed by the agent bound to this MCP API key.',
    inputSchema: {
      status: z.enum(['open', 'done']).optional().describe('Optional status filter'),
    },
  }, async ({ status }) => {
    try {
      return json(await api.getMyTasks(status))
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('claim_task', {
    title: 'Claim Task',
    description: 'Claim a task for the agent bound to this MCP API key. Fails with 409 if another active agent has claimed it.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      return json(await api.claimTask(itemId, taskId))
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('release_task', {
    title: 'Release Task',
    description: 'Release a task claimed by the agent bound to this MCP API key.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
      reason: z.string().optional().describe('Optional release reason'),
    },
  }, async ({ itemId, taskId, reason }) => {
    try {
      return json(await api.releaseTask(itemId, taskId, reason))
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('add_comment', {
    title: 'Add Comment',
    description: 'Add a markdown comment under a task. Use for progress updates, questions, and review notes.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
      body: z.string().describe('Comment body'),
      author: z.string().regex(/^[\w-]+$/).optional().describe('Author slug; defaults to AUTOMD_AGENT_ID or agent'),
    },
  }, async ({ itemId, taskId, body, author }) => {
    try {
      const who = author ?? process.env.AUTOMD_AGENT_ID ?? 'agent'
      return json(await api.addComment(itemId, taskId, who, body))
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('list_comments', {
    title: 'List Comments',
    description: 'List comments under a task.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      return json(await api.listComments(itemId, taskId))
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('request_help', {
    title: 'Request Help',
    description: 'Ask for human help on a task by posting a comment and adding a help-wanted label.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
      question: z.string().describe('Question or blocker to raise'),
    },
  }, async ({ itemId, taskId, question }) => {
    try {
      const who = process.env.AUTOMD_AGENT_ID ?? 'agent'
      const comment = await api.addComment(itemId, taskId, who, `Help needed: ${question}`)
      return json({ ok: true, comment })
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
    description: 'Add a new task (## H2 heading) to a column. Content supports inline metadata: @user #label priority:high|medium|low due:YYYY-MM-DD est:4h knowledge:true. Do not include built-by: manually — use the agentName parameter. Call list_tags to discover existing labels before inventing new ones.',
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
      if (agentName && finalContent !== undefined) {
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
    description: 'Toggle a task between unchecked [ ] and checked [x]. Only applies to tasks with checkbox prefixes. Sets completedAt on check, clears on uncheck.',
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
      // Sanitize title — strip newlines and limit length
      const safeTitle = title.replace(/[\r\n]/g, ' ').trim().slice(0, 200)
      if (!safeTitle) return errorResponse(new Error('Column title cannot be empty'))

      const result = await api.addColumn(itemId, safeTitle)
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
    description: 'Update a task\'s metadata (priority, assignees, labels, due date, estimate) without rewriting its content. Call list_tags to discover existing labels before adding new ones.',
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
        .flatMap((c: ApiColumn) => flattenApiTasks(c.tasks))
        .find((t: ApiTask) => t.id === taskId)

      if (!task) return errorResponse(new Error('Task not found'))

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
    description: 'Search for tasks across all items by text, assignee, label, or status. Results are ranked by relevance. Use list_tags to discover valid label values.',
    inputSchema: {
      query: z.string().optional().describe('Text to search for in task content (supports prefix matching, e.g. "auth" finds "authentication")'),
      assignee: z.string().optional().describe('Filter by assignee (without @)'),
      label: z.string().optional().describe('Filter by label (without #)'),
      checked: z.boolean().optional().describe('Filter by completion status'),
      limit: z.number().min(1).max(100).optional().describe('Max results to return (default 20, max 100)'),
    },
  }, async ({ query, assignee, label, checked, limit }) => {
    try {
      const searchResults = await api.search({
        q: query,
        assignee,
        label,
        checked,
        limit: limit ?? 20,
        compact: true,
      })
      const results = (searchResults.results ?? []).map((r: any) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        taskId: r.taskId,
        title: r.title,
        labels: r.labels,
        column: r.column,
        checked: r.checked,
        relevance: r.score ?? 1,
        matchType: r.matchType,
        tier: r.tier,
      }))
      return json({ count: results.length, total: searchResults.count, mode: searchResults.mode, results })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('search_context', {
    title: 'Search Context',
    description: 'Search for contextual detail (descriptions, acceptance criteria, learnings) across all items. Results ranked by relevance with prefix/fuzzy matching. Returns any task with rich content — broader than find_knowledge which only returns knowledge:true items. Use list_tags to discover valid label values.',
    inputSchema: {
      query: z.string().optional().describe('Text to search for across descriptions, AC, learnings, and task content (supports prefix matching)'),
      label: z.string().optional().describe('Filter by label (without #). Also matches #tags inside learnings text.'),
      completedOnly: z.boolean().optional().describe('Only return completed tasks (default: false). Useful for finding learnings from done work.'),
      detail: z.boolean().optional().describe('Include full descriptions/AC/learnings (default: false for compact results). Use get_task_detail for full single-task content.'),
      limit: z.number().min(1).max(100).optional().describe('Max results to return (default 20, max 100)'),
    },
  }, async ({ query, label, completedOnly, detail, limit }) => {
    try {
      const searchResults = await api.search({
        q: query,
        label,
        checked: completedOnly ? true : undefined,
        hasContext: true,
        limit: limit ?? 20,
        compact: !detail,
      })
      const results = (searchResults.results ?? []).map((r: any) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        taskId: r.taskId,
        title: r.title,
        labels: r.labels,
        column: r.column,
        checked: r.checked,
        ...(detail ? {
          description: r.description,
          acceptanceCriteria: r.acceptanceCriteria,
          learnings: r.learnings,
        } : {
          snippet: r.description ?? r.acceptanceCriteria ?? r.learnings ?? null,
        }),
        relevance: r.score ?? 1,
        matchType: r.matchType,
        tier: r.tier,
      }))
      return json({ count: results.length, total: searchResults.count, mode: searchResults.mode, results })
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Project Tools ───────────────────────────────────────────────

  server.registerTool('list_projects', {
    title: 'List Projects',
    description: 'List all projects with their curated tags. Returns array of {id, name, color, tags}. Use project id as projectId in create_item, get_project_items, or list_tags.',
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

  server.registerTool('update_project', {
    title: 'Update Project',
    description: 'Update a project\'s name, color, or curated tags. Use list_projects to get project IDs.',
    inputSchema: {
      projectId: z.string().describe('The project ID'),
      name: z.string().optional().describe('New project name'),
      color: z.string().optional().describe('New color hex code (e.g. "#3b82f6")'),
      tags: z.array(z.string()).optional().describe('Curated tag list for this project'),
    },
  }, async ({ projectId, name, color, tags }) => {
    try {
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (color !== undefined) updates.color = color
      if (tags !== undefined) updates.tags = tags
      const result = await api.updateProject(projectId, updates)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_project', {
    title: 'Delete Project',
    description: 'Delete a project. Files in the project are NOT deleted — they become unassigned. Use list_projects to get project IDs.',
    inputSchema: {
      projectId: z.string().describe('The project ID to delete'),
    },
  }, async ({ projectId }) => {
    try {
      await api.deleteProject(projectId)
      return text('Project deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('move_file_to_project', {
    title: 'Move File to Project',
    description: 'Move an item (board, checklist, page, knowledge base) into a project. The item\'s projectId is updated. Pass the project ID to assign, or use update_project to manage project membership.',
    inputSchema: {
      projectId: z.string().describe('The target project ID'),
      fileId: z.string().describe('The file/item ID to move into the project'),
    },
  }, async ({ projectId, fileId }) => {
    try {
      const result = await api.moveFileToProject(projectId, fileId)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Tag Registry ───────────────────────────────────────────────

  server.registerTool('list_tags', {
    title: 'List Tags',
    description: 'Discover available tags/labels before searching or tagging content. Returns curated tags (defined by humans), project-specific tags, and tags already in use across items. ALWAYS call this before inventing new tags — reuse existing ones to keep the knowledge base consistent.',
    inputSchema: {
      projectId: z.string().optional().describe('Optional project ID to scope tags to a specific project'),
    },
  }, async ({ projectId }) => {
    try {
      const result = await api.getTags(projectId)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('update_instance_tags', {
    title: 'Update Instance Tags',
    description: 'Set the curated instance-level tag list. These tags appear across all projects and items. Use list_tags first to see current tags.',
    inputSchema: {
      tags: z.array(z.string()).describe('Complete list of curated tags (replaces existing). Tags are normalized to lowercase.'),
    },
  }, async ({ tags }) => {
    try {
      const result = await api.updateInstanceTags(tags)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Knowledge Tools ──────────────────────────────────────────────

  server.registerTool('add_knowledge', {
    title: 'Add Knowledge',
    description: 'Add a knowledge item with automatic duplicate detection. If a similar knowledge item already exists, returns the duplicate instead of creating a new one. Use force:true to bypass dedup. Knowledge items are tasks with knowledge:true — they store decisions, patterns, references, and institutional memory. Call list_tags first to reuse existing labels.',
    inputSchema: {
      itemId: z.string().describe('The item ID'),
      columnId: z.string().describe('The column ID'),
      content: z.string().describe('Knowledge item title (e.g. "Always use parameterized queries for SQL")'),
      description: z.string().optional().describe('Detailed description/context for this knowledge item'),
      learnings: z.string().optional().describe('Key learnings as bullet points (newline-separated). Supports #tags.'),
      labels: z.array(z.string()).optional().describe('Labels for categorization (e.g. ["security", "database"])'),
      agentName: z.string().regex(/^[\w-]+$/).optional().describe('Agent name to tag with built-by:'),
      force: z.boolean().optional().describe('Skip duplicate check and create anyway (default: false)'),
    },
  }, async ({ itemId, columnId, content, description, learnings, labels, agentName, force }) => {
    try {
      // Dedup check (unless forced)
      if (!force) {
        const { items: existing, errors: dedupErrors } = await collectExistingKnowledge()
        const duplicates = findDuplicates({ title: content, description }, existing)
        if (duplicates.length > 0) {
          return json({
            duplicate: true,
            message: 'Similar knowledge already exists. Use update_knowledge to modify the existing entry, or pass force:true to create anyway.',
            matches: duplicates.map(d => ({
              itemId: d.itemId,
              taskId: d.taskId,
              title: d.title,
              titleSimilarity: d.titleSimilarity,
              contentSimilarity: d.contentSimilarity,
            })),
            ...(dedupErrors.length > 0 ? { dedupWarning: `${dedupErrors.length} boards could not be checked` } : {}),
          })
        }
      }

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
        const allTasks = item.columns.flatMap((c: ApiColumn) => flattenApiTasks(c.tasks))
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
    description: 'Search specifically for curated knowledge items (knowledge:true) and tasks with captured learnings. Results ranked by relevance with prefix matching. Use for institutional decisions, patterns, and reference. For broader task history including descriptions, use search_context instead. Use list_tags to discover valid label values.',
    inputSchema: {
      query: z.string().optional().describe('Text to search for in knowledge items (supports prefix matching)'),
      label: z.string().optional().describe('Filter by label (without #)'),
      detail: z.boolean().optional().describe('Include full descriptions/learnings (default: false). Use get_task_detail for full content.'),
      limit: z.number().min(1).max(100).optional().describe('Max results to return (default 20, max 100)'),
    },
  }, async ({ query, label, detail, limit }) => {
    try {
      // Try hybrid search when embeddings are available and we have a text query
      if (query && await serverHasSearch()) {
        try {
          const searchResults = await api.search({ q: query, knowledgeOnly: true, label: label ?? undefined, compact: true })
          return json({ count: searchResults.count, results: searchResults.results, mode: searchResults.mode })
        } catch {
          // Fall through to legacy search
        }
      }

      const items = await api.listFiles()
      const results: any[] = []

      const queryTokens = query ? tokenizeForSearch(query) : []
      const queryLower = query?.toLowerCase()

      for (const itemSummary of items) {
        try {
          const item = await api.getFile(itemSummary.id)
          for (const column of item.columns) {
            for (const task of flattenApiTasks(column.tasks)) {
              // Must be knowledge:true OR have learnings
              const isKnowledge = task.metadata?.knowledge === true
              const hasLearnings = !!task.learnings
              if (!isKnowledge && !hasLearnings) continue

              const searchable = [
                task.content, task.description,
                task.acceptanceCriteria, task.learnings,
                ...(item.meta?.tags ?? []),
              ].filter(Boolean).join(' ')

              // Apply text filter with scored matching
              let relevance = 1.0
              if (query) {
                if (queryTokens.length > 0) {
                  const docTokens = tokenizeForSearch(searchable)
                  relevance = computeScore(queryTokens, docTokens)
                  if (relevance < 0.3) continue
                } else if (queryLower) {
                  if (!searchable.toLowerCase().includes(queryLower)) continue
                }
              }

              // Apply label filter (including frontmatter tags)
              if (label) {
                const hasLabel = task.metadata?.labels?.some(l => l.toLowerCase() === label.toLowerCase())
                const hasInlineTag = task.learnings?.toLowerCase().includes(`#${label.toLowerCase()}`)
                const hasFrontmatterTag = item.meta?.tags?.some(
                  (t: string) => t.toLowerCase() === label.toLowerCase()
                )
                if (!hasLabel && !hasInlineTag && !hasFrontmatterTag) continue
              }

              results.push({
                itemId: itemSummary.id,
                itemName: itemSummary.name,
                taskId: task.id,
                title: task.displayContent,
                labels: task.metadata?.labels ?? [],
                column: column.title,
                ...(detail ? {
                  description: task.description,
                  learnings: task.learnings,
                } : {
                  snippet: task.description ? task.description.slice(0, 100) : null,
                }),
                relevance: Math.round(relevance * 100) / 100,
              })
            }
          }
        } catch (err) {
          console.error(`[mcp] Failed to search item ${itemSummary.id}:`, err)
        }
      }

      // Sort by relevance descending, then limit
      results.sort((a, b) => b.relevance - a.relevance)
      const maxResults = limit ?? 20
      const limitedResults = results.slice(0, maxResults)

      return json({ count: limitedResults.length, total: results.length, results: limitedResults })
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('synthesize_topic', {
    title: 'Synthesize Topic',
    description: 'Gather all knowledge about a topic and return a comprehensive context brief. Collects knowledge items, learnings from tasks, active related work, and board context — does NOT generate AI content. Returns a paste-ready summary with counts.',
    inputSchema: {
      topic: z.string().describe('Topic to synthesize knowledge about (e.g. "authentication", "pricing", "deployment")'),
      labels: z.string().optional().describe('Comma-separated labels to filter by (e.g. "backend,security"). Unlike label on other tools which takes a single value, this accepts multiple comma-separated.'),
    },
  }, async ({ topic, labels }) => {
    try {
      const result = await api.getContext({ topic, labels, limit: 50 })
      const header = `Found ${result.knowledgeCount} knowledge items, ${result.learningCount} learnings, ${result.relatedTaskCount ?? 0} active tasks across ${result.boardContextCount ?? 0} boards.\n\n`
      return text(header + result.context)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('import_memories', {
    title: 'Import Memories',
    description: 'Bulk import knowledge items from external sources (AI conversation logs, meeting notes, etc.). Automatically skips duplicates unless skipDuplicates is set to false. Creates knowledge:true tasks for each item.',
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
      skipDuplicates: z.boolean().optional().describe('Skip items that match existing knowledge (default: true)'),
    },
  }, async ({ itemId, columnId, items, agentName, skipDuplicates }) => {
    try {
      const shouldSkipDups = skipDuplicates !== false // default true

      // Pre-fetch existing knowledge for dedup (once, not per item)
      let existingKnowledge: ExistingKnowledgeItem[] = []
      if (shouldSkipDups) {
        const { items: existing } = await collectExistingKnowledge()
        existingKnowledge = existing
      }

      const results: Array<{ content: string; taskId: string }> = []
      const skippedItems: Array<{ content: string; matchedTitle: string; similarity: number }> = []
      const errors: string[] = []

      for (const item of items) {
        // Dedup check
        if (shouldSkipDups) {
          const duplicates = findDuplicates({ title: item.content, description: item.description }, existingKnowledge)
          if (duplicates.length > 0) {
            skippedItems.push({
              content: item.content,
              matchedTitle: duplicates[0].title,
              similarity: duplicates[0].titleSimilarity,
            })
            continue
          }
        }

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

          if (!result?.taskId) {
            errors.push(`Failed to create task for: ${item.content.slice(0, 50)}`)
            continue
          }

          results.push({ content: item.content, taskId: result.taskId })

          // Add newly created item to existing knowledge so subsequent items in this batch can dedup against it
          if (shouldSkipDups && result?.taskId) {
            existingKnowledge.push({
              taskId: result.taskId,
              itemId,
              title: item.content,
              description: item.description,
            })
          }
        } catch (err) {
          errors.push(`Failed to import "${item.content}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      return json({
        imported: results.length,
        skipped: skippedItems.length,
        failed: errors.length,
        results,
        skippedItems: skippedItems.length > 0 ? skippedItems : undefined,
        errors: errors.length > 0 ? errors : undefined,
      })
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Relationship Tools ──────────────────────────────────────────

  server.registerTool('link_tasks', {
    title: 'Link Tasks',
    description: 'Create a relationship between two tasks or knowledge items. Relationships help build a context graph for smarter retrieval.',
    inputSchema: {
      sourceItemId: z.string().describe('Source board/item ID'),
      sourceTaskId: z.string().describe('Source task ID'),
      targetItemId: z.string().describe('Target board/item ID'),
      targetTaskId: z.string().describe('Target task ID'),
      relationType: z.enum(['depends-on', 'related-to', 'supersedes', 'learned-from']).describe(
        'Relationship type: depends-on (A blocks B), related-to (bidirectional), supersedes (A replaces B), learned-from (knowledge extracted from task)',
      ),
    },
  }, async ({ sourceItemId, sourceTaskId, targetItemId, targetTaskId, relationType }) => {
    try {
      const result = await api.addRelationship({
        sourceItemId, sourceTaskId, targetItemId, targetTaskId,
        relationType, createdBy: 'agent',
      })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_related', {
    title: 'Get Related',
    description: 'Get all tasks/knowledge related to a specific task via explicit relationships and auto-detected similarity. Returns both incoming and outgoing relationships.',
    inputSchema: {
      itemId: z.string().describe('The item/board ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      const result = await api.getRelationships(itemId, taskId)
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('delete_relationship', {
    title: 'Delete Relationship',
    description: 'Remove a relationship between two tasks. Use get_related to find relationship IDs.',
    inputSchema: {
      relationshipId: z.string().describe('The relationship ID (from get_related response)'),
    },
  }, async ({ relationshipId }) => {
    try {
      await api.deleteRelationship(relationshipId)
      return text('Relationship deleted')
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_relationship_stats', {
    title: 'Get Relationship Stats',
    description: 'Get statistics about the relationship graph: total relationships, auto-detected count, and manually created count.',
  }, async () => {
    try {
      const result = await api.getRelationshipStats()
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  server.registerTool('get_working_context', {
    title: 'Get Working Context',
    description: 'Assemble rich context for a task or topic. Returns the task itself, related knowledge (via relationships + semantic similarity), recent learnings from completed tasks, and board-level context. One call replaces: get_item + find_knowledge + search_context + synthesize_topic.',
    inputSchema: {
      itemId: z.string().optional().describe('The item/board ID (required if taskId provided)'),
      taskId: z.string().optional().describe('The task ID to get context for'),
      topic: z.string().optional().describe('Topic string for topic-based context assembly (alternative to itemId+taskId)'),
      limit: z.number().optional().describe('Max related items to return (default 10, max 30)'),
    },
  }, async ({ itemId, taskId, topic, limit }) => {
    try {
      const result = await api.assembleContext({ itemId, taskId, topic, limit })
      return json(result)
    } catch (err) {
      return errorResponse(err)
    }
  })

  // ─── Archive Tools ─────────────────────────────────────────────

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

        for (const task of flattenApiTasks(column.tasks)) {
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
