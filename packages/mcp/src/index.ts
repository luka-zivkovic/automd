import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts/index.js'
import { api } from './api-client.js'

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

const requestedAgentId = process.env.AUTOMD_AGENT_ID
if (requestedAgentId) {
  try {
    const agent = await api.getMyAgent() as { id: string; slug: string }
    if (agent.id !== requestedAgentId && agent.slug !== requestedAgentId) {
      console.error(`AUTOMD_AGENT_ID=${requestedAgentId} does not match API key agent (${agent.id}/${agent.slug})`)
      process.exit(1)
    }
  } catch (err) {
    console.error(`Failed to verify AUTOMD_AGENT_ID. Ensure AUTOMD_API_KEY is bound to this agent. ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

const server = new McpServer({
  name: 'automd',
  version: pkg.version ?? '0.1.0',
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
