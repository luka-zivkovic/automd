import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from '../api-client.js'

function errorMessages(itemId: string, err: unknown) {
  return {
    messages: [{
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: `Error loading item ${itemId}: ${err instanceof Error ? err.message : String(err)}. Please verify the item ID exists and the server is running.`,
      },
    }],
  }
}

export function registerWorkflowPrompts(server: McpServer) {
  server.registerPrompt('decompose_task', {
    description: 'Break down a complex task into subtasks with estimates',
    argsSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID to decompose'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      const board = await api.getFile(itemId)
      const allTasks = board.columns.flatMap((c: any) => {
        const result: any[] = []
        const stack = [...c.tasks]
        while (stack.length) {
          const t = stack.pop()
          result.push(t)
          if (t.children) stack.push(...t.children)
        }
        return result
      })
      const task = allTasks.find((t: { id: string }) => t.id === taskId)
      const taskJson = JSON.stringify(task, null, 2)

      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Decompose this task into actionable subtasks:

Task:
${taskJson}

Please:
1. Break this into 3-7 concrete subtasks that together complete the parent task
2. Estimate hours for each subtask
3. Identify any dependencies between subtasks
4. Suggest which subtasks could be parallelized

Subtasks are GFM checkboxes (\`- [ ] text\`) inside the parent task's content. Use update_task to add them to the parent task's body, or use add_task to create standalone tasks.`,
          },
        }],
      }
    } catch (err) {
      return errorMessages(itemId, err)
    }
  })

  server.registerPrompt('write_acceptance_criteria', {
    description: 'Write acceptance criteria for a task',
    argsSchema: {
      itemId: z.string().describe('The item ID'),
      taskId: z.string().describe('The task ID'),
    },
  }, async ({ itemId, taskId }) => {
    try {
      const board = await api.getFile(itemId)
      const allTasks = board.columns.flatMap((c: any) => {
        const result: any[] = []
        const stack = [...c.tasks]
        while (stack.length) {
          const t = stack.pop()
          result.push(t)
          if (t.children) stack.push(...t.children)
        }
        return result
      })
      const task = allTasks.find((t: { id: string }) => t.id === taskId)
      const taskJson = JSON.stringify(task, null, 2)

      return {
        messages: [{
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Write clear, testable acceptance criteria for this task:

Task:
${taskJson}

Write acceptance criteria that are:
1. Testable — each criterion has a clear pass/fail outcome
2. Specific — no ambiguity about what "done" means
3. Complete — cover the main scenarios and edge cases
4. Concise — one clear condition per line

Provide the update_acceptance_criteria tool call with the criteria as newline-separated text.`,
          },
        }],
      }
    } catch (err) {
      return errorMessages(itemId, err)
    }
  })

  server.registerPrompt('kickoff_board', {
    description: 'Set up a new board for a project with initial structure',
    argsSchema: {
      projectName: z.string().describe('The project/domain name'),
      context: z.string().optional().describe('Additional context about the project'),
    },
  }, async ({ projectName, context }) => {
    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me set up an AutoMD board for: "${projectName}"
${context ? `\nContext: ${context}` : ''}

Please:
1. Suggest appropriate columns for the workflow
2. Suggest vocabulary dimensions relevant to this domain
3. Create initial tasks to get started (including knowledge items for key decisions)
4. Set up a knowledge base board alongside the task board if the project would benefit from it

Use create_item with appropriate markdown including YAML frontmatter with vocabulary. Then add initial tasks with add_task and add_knowledge.`,
        },
      }],
    }
  })

  server.registerPrompt('find_knowledge_prompt', {
    description: 'Search for and synthesize knowledge about a topic across all boards',
    argsSchema: {
      topic: z.string().describe('The topic to find knowledge about'),
    },
  }, async ({ topic }) => {
    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Find everything AutoMD knows about: "${topic}"

Use the find_knowledge tool to search for relevant knowledge items and learnings. Then use synthesize_topic to get a structured summary.

After gathering the knowledge, provide:
1. A summary of what's known
2. Key decisions and their reasoning
3. Patterns and best practices discovered
4. Gaps — what's NOT known that should be documented
5. Recommendations based on past learnings`,
        },
      }],
    }
  })

  server.registerPrompt('import_memories_prompt', {
    description: 'Guide for importing knowledge from external AI tools into AutoMD',
    argsSchema: {
      source: z.string().optional().describe('Source platform (e.g. "Claude", "ChatGPT", "meeting notes")'),
    },
  }, async ({ source }) => {
    return {
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `Help me import knowledge into AutoMD${source ? ` from ${source}` : ''}.

I'll paste my notes/memories below. Please:
1. Parse the content into individual knowledge items
2. Categorize each with appropriate labels
3. Use import_memories to bulk-create them on an appropriate board
4. If no knowledge board exists, create one first with create_item

Each imported item should have:
- A clear, concise title
- Description with context
- Labels for categorization
- Relevant learnings extracted as bullet points

Please ask me to paste my notes now.`,
        },
      }],
    }
  })
}
