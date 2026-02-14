import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'

export function registerPrompts(server: McpServer) {
  server.registerPrompt('triage_tasks', {
    description: 'Review uncategorized tasks and suggest columns/priorities',
    argsSchema: {
      boardId: z.string().describe('The board ID to triage'),
    },
  }, async ({ boardId }) => {
    const board = await api.getFile(boardId)
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
      boardId: z.string().describe('The board ID to summarize'),
    },
  }, async ({ boardId }) => {
    const board = await api.getFile(boardId)
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

  server.registerPrompt('sprint_planning', {
    description: 'Help plan next sprint from backlog',
    argsSchema: {
      boardId: z.string().describe('The board ID to plan from'),
      sprintCapacityHours: z.number().optional().describe('Total sprint capacity in hours'),
    },
  }, async ({ boardId, sprintCapacityHours }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    const capacityNote = sprintCapacityHours
      ? `The team has ${sprintCapacityHours} hours of capacity for this sprint.`
      : 'No specific capacity constraint was provided.'

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a sprint planning assistant for the board "${board.name}". Help plan the next sprint from the following board data:

Board data:
${boardJson}

${capacityNote}

Please help with sprint planning by:
1. Identifying tasks from the backlog that should be pulled into the next sprint
2. Prioritizing tasks based on their priority labels, due dates, and dependencies
3. Suggesting task assignments based on current workload distribution
4. Estimating total effort if tasks have estimates, flagging tasks that need estimates
5. Identifying any blockers or dependencies that should be resolved first
6. Recommending a realistic sprint scope

Provide specific tool calls the agent can execute to move tasks into the sprint and update their metadata.`,
        },
      }],
    }
  })
}
