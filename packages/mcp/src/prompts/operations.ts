import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from '../api-client.js'

export function registerOperationsPrompts(server: McpServer) {
  server.registerPrompt('triage_tasks', {
    description: 'Review uncategorized tasks and suggest columns/priorities',
    argsSchema: {
      itemId: z.string().describe('The item ID to triage'),
    },
  }, async ({ itemId }) => {
    const board = await api.getFile(itemId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a task triage assistant for the board "${board.name}". Review the following board data and suggest improvements:

Board data:
${boardJson}

Please analyze the tasks and provide:
1. Tasks that appear uncategorized or in the wrong column
2. Tasks missing priority levels that should have them
3. Tasks missing assignees that appear to need owners
4. Suggestions for new columns if current organization could be improved
5. Tasks that might be duplicates or could be merged

For each suggestion, explain your reasoning and provide the specific tool calls needed to implement the changes.`,
        },
      }],
    }
  })

  server.registerPrompt('daily_standup', {
    description: 'Summarize progress: what\'s done, in progress, blocked',
    argsSchema: {
      itemId: z.string().describe('The item ID to summarize'),
    },
  }, async ({ itemId }) => {
    const board = await api.getFile(itemId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a standup meeting facilitator for the board "${board.name}". Generate a daily standup summary from the following board data:

Board data:
${boardJson}

Please provide a concise standup report covering:
1. **Completed** - Tasks that are checked/done
2. **In Progress** - Tasks that are unchecked in active columns (not backlog)
3. **Blocked/At Risk** - Tasks that are overdue, high priority but unassigned, or appear stalled
4. **Key Metrics** - Total tasks, completion rate, overdue count

Format the summary in a way that would be useful for a quick team sync.`,
        },
      }],
    }
  })

  server.registerPrompt('retrospective', {
    description: 'Run a retrospective on completed work and extract learnings',
    argsSchema: {
      itemId: z.string().describe('The item ID to retrospect on'),
    },
  }, async ({ itemId }) => {
    const board = await api.getFile(itemId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Run a retrospective on board "${board.name}":

Board data:
${boardJson}

Analyze completed tasks and the board state to provide:
1. **Went Well** — Tasks completed on time, good patterns observed
2. **Could Improve** — Bottlenecks, tasks that took too long, missing estimates
3. **Action Items** — Concrete improvements for next iteration
4. **Learnings to Capture** — Key decisions and patterns worth preserving as knowledge items

For each learning worth capturing, provide add_knowledge or add_learning tool calls so they're preserved for future reference.`,
        },
      }],
    }
  })

  server.registerPrompt('board_cleanup', {
    description: 'Clean up stale tasks, duplicates, and organizational issues',
    argsSchema: {
      itemId: z.string().describe('The item ID to clean up'),
    },
  }, async ({ itemId }) => {
    const board = await api.getFile(itemId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Clean up board "${board.name}":

Board data:
${boardJson}

Please identify and suggest fixes for:
1. **Stale tasks** — Completed tasks that should be archived (use archive_completed_tasks)
2. **Duplicates** — Tasks that appear to cover the same work
3. **Orphaned subtasks** — Subtasks whose parent context is unclear
4. **Missing metadata** — Tasks without priorities, estimates, or labels that should have them
5. **Column balance** — Columns with too many tasks that should be split or reorganized

Provide the specific tool calls to implement each cleanup action.`,
        },
      }],
    }
  })

  server.registerPrompt('handoff_summary', {
    description: 'Generate a handoff summary for transitioning work between people or AI agents',
    argsSchema: {
      itemId: z.string().describe('The item ID to summarize'),
      context: z.string().optional().describe('What the handoff is for (e.g. "new team member", "agent sync")'),
    },
  }, async ({ itemId, context }) => {
    const board = await api.getFile(itemId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Generate a handoff summary for board "${board.name}"${context ? ` (${context})` : ''}:

Board data:
${boardJson}

Create a comprehensive handoff document covering:
1. **Project Overview** — What this board tracks and its current state
2. **Active Work** — What's in progress and who's working on it
3. **Key Decisions** — Important decisions made (from knowledge items and learnings)
4. **Blockers & Risks** — What's stuck and why
5. **Next Steps** — Recommended priorities for the person/agent taking over
6. **Context & Conventions** — Board vocabulary, labeling patterns, workflow norms

Format as a self-contained briefing that gives full context without needing to read the entire board.`,
        },
      }],
    }
  })
}
