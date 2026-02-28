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
    description: 'Review and add time estimates to tasks that are missing them',
    argsSchema: {
      boardId: z.string().describe('The board to estimate'),
      columnId: z.string().optional().describe('Only estimate tasks in this column'),
    },
  }, async ({ boardId, columnId }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a task estimation specialist for the board "${board.name}". Add time estimates to tasks that are missing them.

Board data:
${boardJson}

${columnId ? `Focus on column: ${columnId}` : 'Estimate all tasks missing estimates.'}

## Instructions

1. Identify all tasks missing the \`est:Xh\` estimate.

2. For calibration, examine completed tasks that DO have estimates:
   - What was their estimated effort?
   - Do their learnings suggest the estimate was accurate?
   - Use these as reference points.

3. Use \`search_context\` to find similar completed tasks on other boards for cross-project calibration.

4. For each task needing an estimate:
   - Consider its description, AC count, and subtask count
   - Compare to similar completed tasks
   - Factor in uncertainty — if AC is vague or description thin, estimate higher
   - Provide your reasoning

5. Apply estimates using \`update_task_metadata\` with the \`estimate\` field.

6. Provide a summary:
   - Total estimated hours for newly-estimated tasks
   - Tasks with highest uncertainty that might need decomposition
   - Comparison to completed task averages

Estimate in increments of: 0.5h, 1h, 2h, 4h, 8h, 16h. If >16h, recommend decomposition.`,
        },
      }],
    }
  })

  server.registerPrompt('dependency_analysis', {
    description: 'Analyze task dependencies on a board and suggest optimal execution order',
    argsSchema: {
      boardId: z.string().describe('The board to analyze'),
    },
  }, async ({ boardId }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a dependency analysis specialist for the board "${board.name}".

Board data:
${boardJson}

## Instructions

1. Analyze all uncompleted tasks on the board.

2. Determine dependencies by examining:
   - Explicit mentions of other tasks in descriptions
   - Shared labels/components implying ordering (#api before #frontend)
   - AC that references functionality from other tasks
   - Common software development ordering (data model → API → UI)
   - Subtask relationships

3. Build a dependency map:
   - **Independent** tasks (can start immediately)
   - **Depends on** (specify which tasks)
   - **Blocks** other tasks (high priority to complete)
   - **Critical path** — longest dependency chain

4. Produce a recommended execution order:
   - Group tasks into parallel lanes where possible
   - Identify the optimal "next task" to pick up
   - Flag circular or conflicting dependencies

5. If tasks in active columns depend on uncompleted backlog tasks, flag this as a risk.

6. Suggest reordering via \`move_task\` to reflect dependency order within columns.`,
        },
      }],
    }
  })
}
