import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from '../api-client.js'

export function registerPlanningPrompts(server: McpServer) {
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

  server.registerPrompt('estimate_tasks', {
    description: 'Estimate effort for unestimated tasks on a board',
    argsSchema: {
      boardId: z.string().describe('The board ID'),
      columnId: z.string().optional().describe('Optional column ID to scope estimation'),
    },
  }, async ({ boardId, columnId }) => {
    const board = await api.getFile(boardId)
    const allTasks = board.columns.flatMap((c: { id: string; tasks: unknown[] }) =>
      columnId ? (c.id === columnId ? c.tasks : []) : c.tasks
    )
    const tasksJson = JSON.stringify(allTasks, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Estimate effort for tasks on board "${board.name}"${columnId ? ' (filtered column)' : ''}:

Tasks:
${tasksJson}

For each task without an estimate:
1. Analyze complexity based on title, description, acceptance criteria, and subtasks
2. Provide an estimate in hours (use est: token format)
3. Flag tasks that are too vague to estimate — suggest clarifying questions
4. Compare with similar estimated tasks for consistency

Provide update_task_metadata tool calls to set estimates.`,
        },
      }],
    }
  })

  server.registerPrompt('dependency_analysis', {
    description: 'Analyze task dependencies and suggest ordering',
    argsSchema: {
      boardId: z.string().describe('The board ID to analyze'),
    },
  }, async ({ boardId }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Analyze dependencies between tasks on board "${board.name}":

Board data:
${boardJson}

Please:
1. Identify implicit dependencies between tasks (based on titles, descriptions, subtasks)
2. Flag circular or conflicting dependencies
3. Suggest an execution order that respects dependencies
4. Identify tasks that can be parallelized
5. Highlight critical path items that would block the most work if delayed

Present as a dependency graph and recommended execution sequence.`,
        },
      }],
    }
  })
}
