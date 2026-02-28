import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerSystemPrompts } from './system.js'
import { registerWorkflowPrompts } from './workflows.js'
import { registerPlanningPrompts } from './planning.js'
import { registerOperationPrompts } from './operations.js'

export function registerPrompts(server: McpServer) {
  registerSystemPrompts(server)
  registerWorkflowPrompts(server)
  registerPlanningPrompts(server)
  registerOperationPrompts(server)
}
