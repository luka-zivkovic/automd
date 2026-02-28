import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from '../api-client.js'

export function registerOperationPrompts(server: McpServer) {
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
1. **Completed** — Tasks that are checked/done
2. **In Progress** — Tasks that are unchecked in active columns (not backlog)
3. **Blocked/At Risk** — Tasks that are overdue, high priority but unassigned, or appear stalled
4. **Key Metrics** — Total tasks, completion rate, overdue count

Format the summary in a way that would be useful for a quick team sync.`,
        },
      }],
    }
  })

  server.registerPrompt('retrospective', {
    description: 'Run a retrospective on completed work — what went well, what didn\'t, actionable improvements',
    argsSchema: {
      boardId: z.string().describe('The board to review'),
      timeframeDays: z.number().optional().describe('Only consider tasks completed in the last N days (default: 14)'),
    },
  }, async ({ boardId, timeframeDays }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)
    const days = timeframeDays ?? 14

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a retrospective facilitator for the board "${board.name}". Analyze completed work and generate a retrospective report.

Board data:
${boardJson}

Timeframe: Last ${days} days

## Analysis Steps

1. **Identify completed tasks** — Checked/done tasks, especially those with learnings.

2. **What went well** — Tasks completed on time, positive learnings, good AC that guided implementation.

3. **What could be improved** — Overdue tasks, missing estimates (planning gap), no AC (scope ambiguity), negative learnings or unexpected complexity.

4. **Estimate accuracy** — Compare estimates (est:Xh) vs actual effort from learnings.

5. **Knowledge gaps** — Tasks blocked or with learnings suggesting expertise gaps.

6. **Patterns** — Recurring #labels or themes in learnings across completed tasks.

## Output

Provide a structured retrospective:
- **Summary** — Sprint/period overview with key metrics
- **What went well** (keep doing) — 3-5 items
- **What to improve** (change) — 3-5 items with specific suggestions
- **Action items** — Concrete task for each improvement

For each action item, offer to create it on the board using \`add_task\` with AC and metadata.`,
        },
      }],
    }
  })

  server.registerPrompt('board_cleanup', {
    description: 'Audit a board for stale tasks, inconsistencies, and hygiene issues',
    argsSchema: {
      boardId: z.string().describe('The board to audit'),
      autoFix: z.boolean().optional().describe('If true, automatically apply safe fixes (default: false)'),
    },
  }, async ({ boardId, autoFix }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)
    const fixMode = autoFix ?? false

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a board hygiene specialist for "${board.name}". Audit the board and identify issues.

Board data:
${boardJson}

Auto-fix mode: ${fixMode ? 'ON — apply safe fixes automatically' : 'OFF — suggest fixes only'}

## Audit Checklist

1. **Stale tasks** — Tasks in active columns with past-due dates and no recent activity. Suggest moving to backlog or archiving.

2. **Missing metadata** — Tasks without priority, estimates, assignees (in active columns), or labels.

3. **Empty columns** — Columns with zero tasks that may be unnecessary.

4. **Completed but not moved** — Checked tasks sitting in non-Done columns.

5. **Overdue tasks** — Tasks past due date that are not done.

6. **Missing acceptance criteria** — Tasks in active columns without AC.

7. **Large tasks** — Tasks with >8h estimate or >5 subtasks that should be decomposed.

8. **Inconsistent labels** — Similar labels that should be unified (e.g., #frontend vs #front-end).

9. **Orphaned tasks** — Tasks with no description, no AC, no subtasks, and vague titles.

10. **Done tasks without learnings** — Completed tasks that should have learnings recorded.

11. **Old completed tasks** — Done tasks with \`completed-at:\` older than 30 days that should be archived. Use \`archive_completed_tasks\` tool for bulk archival.

## Output

For each issue:
- Describe the problem
- Severity: low / medium / high
- Suggested fix with specific tool call

${fixMode
  ? 'For low-severity issues, apply fixes automatically. For medium/high severity, list them for user approval.'
  : 'List all issues with suggested fixes. Do not apply changes.'}`,
        },
      }],
    }
  })

  server.registerPrompt('handoff_summary', {
    description: 'Generate a context-rich handoff document for onboarding a new team member or AI agent',
    argsSchema: {
      boardId: z.string().describe('The board to summarize'),
      assignee: z.string().optional().describe('Focus on tasks assigned to this person'),
    },
  }, async ({ boardId, assignee }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are generating a handoff briefing for the board "${board.name}".

Board data:
${boardJson}

${assignee ? `Focus on tasks assigned to: @${assignee}` : 'Generate a full board handoff.'}

## Instructions

1. Search for learnings using \`search_context\` to gather institutional knowledge from this board.

2. Generate a comprehensive briefing:

   **Project Status**
   - Overall completion percentage
   - Current phase of work
   - Key metrics: total tasks, in-progress, overdue

   **Completed Work**
   - Summary of done tasks and key learnings
   - Important decisions made

   **In Progress**
   - Active tasks with status and assignees
   - Blockers or risks

   **What's Next**
   - Prioritized upcoming tasks
   - Recommended starting point
   - Dependencies to be aware of

   **Key Knowledge**
   - Synthesized learnings from completed tasks
   - Important AC patterns
   - Technical decisions and constraints

${assignee ? `   **@${assignee}'s Context**\n   - Their assigned tasks across all columns\n   - Priority order for their work\n   - Context needed from others' completed work\n` : ''}
3. Format as a clear, scannable document readable in 5 minutes.`,
        },
      }],
    }
  })
}
