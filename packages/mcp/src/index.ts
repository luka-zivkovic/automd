#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'

const server = new McpServer({
  name: 'automd',
  version: '0.0.1',
}, {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
})

registerTools(server)
registerResources(server)
registerPrompts(server)

// Use stdio transport by default (for Claude Desktop / CLI)
const transport = new StdioServerTransport()
await server.connect(transport)
