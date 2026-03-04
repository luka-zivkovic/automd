import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'

export function registerResources(server: McpServer) {
  // All items summary
  server.registerResource('items', 'automd://items', {
    description: 'List of all AutoMD items (boards, checklists, pages)',
    mimeType: 'application/json',
  }, async () => {
    const items = await api.listFiles()
    return {
      contents: [
        {
          uri: 'automd://items',
          mimeType: 'application/json',
          text: JSON.stringify(items, null, 2),
        },
      ],
    }
  })

  // Single item by ID
  server.registerResource('item', new ResourceTemplate('automd://items/{itemId}', { list: undefined }), {
    description: 'A single AutoMD item (board, checklist, or page) with columns and tasks',
    mimeType: 'application/json',
  }, async (uri, { itemId }) => {
    const item = await api.getFile(itemId as string)
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(item, null, 2),
        },
      ],
    }
  })

  // Item markdown
  server.registerResource('item-markdown', new ResourceTemplate('automd://items/{itemId}/markdown', { list: undefined }), {
    description: 'Raw markdown content of an item',
    mimeType: 'text/markdown',
  }, async (uri, { itemId }) => {
    const item = await api.getFile(itemId as string)
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: item.markdown,
        },
      ],
    }
  })

  // All projects
  server.registerResource('projects', 'automd://projects', {
    description: 'List of all AutoMD projects',
    mimeType: 'application/json',
  }, async () => {
    const projects = await api.listProjects()
    return {
      contents: [
        {
          uri: 'automd://projects',
          mimeType: 'application/json',
          text: JSON.stringify(projects, null, 2),
        },
      ],
    }
  })
}
