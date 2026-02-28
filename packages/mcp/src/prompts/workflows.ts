import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from '../api-client.js'

export function registerWorkflowPrompts(server: McpServer) {
  server.registerPrompt('decompose_task', {
    description: 'Break down a high-level feature or epic into well-structured tasks with AC, subtasks, and estimates',
    argsSchema: {
      boardId: z.string().describe('The board to add tasks to'),
      featureDescription: z.string().describe('Natural language description of the feature/epic to decompose'),
      targetColumnId: z.string().optional().describe('Column to add tasks into (defaults to first column)'),
    },
  }, async ({ boardId, featureDescription, targetColumnId }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a task decomposition specialist for the board "${board.name}". Break down the following feature into well-structured tasks.

Feature to decompose:
${featureDescription}

Current board state:
${boardJson}

## Instructions

1. First, search for related existing work using \`search_context\` with relevant keywords. Look for past learnings, decisions, and overlapping tasks.

2. Decompose the feature into 3-8 discrete, implementable tasks. Each task should:
   - Be completable in 1-8 hours
   - Have a clear, action-oriented title
   - Be independent enough to work on in isolation

3. For EACH task, provide:
   - **Title** with appropriate metadata: #labels, priority:level, est:Xh
   - **Description** (1-2 paragraphs explaining "why" and context)
   - **Acceptance Criteria** (2-5 testable conditions)
   - **Subtasks** if the task has clear sub-steps

4. Consider task ordering — which tasks should come first? Add dependency notes in descriptions.

5. Execute tool calls to create all tasks:
   - \`add_task\` for each task with agentName
   - \`update_acceptance_criteria\` for each task
   - \`update_task_metadata\` to set priority, labels, estimates

Target column: ${targetColumnId ?? 'first available column (backlog)'}

6. After creating all tasks, provide a summary and suggested implementation order.`,
        },
      }],
    }
  })

  server.registerPrompt('write_acceptance_criteria', {
    description: 'Generate or improve acceptance criteria for one or more tasks on a board',
    argsSchema: {
      boardId: z.string().describe('The board containing the tasks'),
      taskId: z.string().optional().describe('Specific task ID (if omitted, finds all tasks missing AC)'),
    },
  }, async ({ boardId, taskId }) => {
    const board = await api.getFile(boardId)
    const boardJson = JSON.stringify(board, null, 2)

    const focus = taskId
      ? `Focus on task: ${taskId}. Review its current acceptance criteria and either create new ones or improve existing ones.`
      : 'Scan all tasks and identify those missing acceptance criteria or with weak/vague criteria. Prioritize tasks in active columns (not Done).'

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are an acceptance criteria specialist for the board "${board.name}".

Board data:
${boardJson}

${focus}

## Guidelines for Good Acceptance Criteria

- Each criterion must be **testable** — someone should be able to verify it as pass/fail
- Write from the **user's perspective** when possible ("User can...", "System displays...")
- Be **specific** — avoid vague terms like "fast", "good", "properly"
- Cover **edge cases** — what happens with empty input, errors, permissions?
- Include **non-functional requirements** where relevant — performance, accessibility, security
- Keep it to 2-6 criteria per task (more suggests the task should be decomposed)

## Instructions

1. For each task needing AC, analyze its title, description, and subtasks to understand what "done" means.
2. Use \`search_context\` to find related tasks' AC for consistency.
3. Draft the acceptance criteria.
4. Call \`update_acceptance_criteria\` for each task (one criterion per line).
5. Summarize what was updated.`,
        },
      }],
    }
  })

  server.registerPrompt('kickoff_board', {
    description: 'Scaffold a new board for a project with appropriate columns, initial tasks, and structure',
    argsSchema: {
      projectDescription: z.string().describe('Description of the project/initiative'),
      boardStyle: z.enum(['kanban', 'sprint', 'simple']).optional().describe('Board style (default: kanban)'),
      projectId: z.string().optional().describe('Project to associate the board with'),
    },
  }, async ({ projectDescription, boardStyle, projectId }) => {
    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a project planning specialist. Create a well-structured board for the following project.

Project description:
${projectDescription}

Board style: ${boardStyle ?? 'kanban'}
${projectId ? `Associate with project: ${projectId}` : ''}

## Board Styles

- **kanban**: Columns: Backlog, To Do, In Progress, Review, Done
- **sprint**: Columns: Sprint Backlog, In Progress, Review, Done, Next Sprint
- **simple**: Columns: To Do, Doing, Done

## Instructions

1. Use \`search_context\` across existing boards to find related work, learnings, or overlapping tasks.

2. Create the board using \`create_board\` with:
   - A clear, concise board name derived from the project description
   - YAML frontmatter with board name, description, and relevant tags
   - Appropriate columns for the chosen style
   - 5-10 initial tasks covering the obvious first steps

3. Each initial task should have:
   - Descriptive title with #labels and priority levels
   - A description paragraph explaining context
   - Acceptance criteria (blockquotes)
   - Estimated effort (est:Xh)

4. Generate the full markdown content and pass it to \`create_board\` in a single call.

5. After creating the board, call \`update_acceptance_criteria\` for each task to add proper AC.

6. Provide a summary and suggest which task to pick up first.`,
        },
      }],
    }
  })

  server.registerPrompt('find_knowledge', {
    description: 'Retrieve institutional knowledge relevant to a topic by searching past learnings, AC, and descriptions',
    argsSchema: {
      topic: z.string().describe('What you want to know about (e.g., "authentication", "pricing")'),
      boardId: z.string().optional().describe('Restrict search to a specific board (default: all boards)'),
    },
  }, async ({ topic, boardId }) => {
    let boardContext = ''
    if (boardId) {
      const board = await api.getFile(boardId)
      boardContext = `\nScope: Board "${board.name}" only\n\nBoard data:\n${JSON.stringify(board, null, 2)}`
    }

    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `You are a knowledge retrieval assistant for AutoMD. Find and synthesize everything the team has learned about the given topic.

Topic: ${topic}
${boardId ? boardContext : 'Scope: All boards'}

## Instructions

1. Call \`search_context\` with the topic as query. Also try related keywords and synonyms.
${boardId ? '' : '2. If the topic relates to a specific label, also search by label.\n'}
2. For each result found, extract:
   - **Learnings** — What was discovered? What worked or didn't?
   - **Decisions** — What approaches were chosen and why?
   - **Acceptance Criteria** — What standards were established?
   - **Open Questions** — What is still unresolved?

3. Synthesize into a structured knowledge brief:
   - **Summary** — 2-3 sentence overview
   - **Key Decisions** — Decisions made, with rationale
   - **Lessons Learned** — What to do and what to avoid
   - **Relevant Tasks** — Board + task ID references for deeper context
   - **Gaps** — What the team should document but hasn't yet

4. If no results found, say so clearly and suggest what to document.`,
        },
      }],
    }
  })
}
