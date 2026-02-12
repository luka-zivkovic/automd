import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './api-client.js'

export function registerResources(server: McpServer) {
  // All boards summary
  server.registerResource('boards', 'automd://boards', {
    description: 'List of all AutoMD boards',
    mimeType: 'application/json',
  }, async () => {
    const boards = await api.listFiles()
    return {
      contents: [
        {
          uri: 'automd://boards',
          mimeType: 'application/json',
          text: JSON.stringify(boards, null, 2),
        },
      ],
    }
  })

  // Single board by ID
  server.registerResource('board', new ResourceTemplate('automd://boards/{boardId}', { list: undefined }), {
    description: 'A single AutoMD board with columns and tasks',
    mimeType: 'application/json',
  }, async (uri, { boardId }) => {
    const board = await api.getFile(boardId as string)
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(board, null, 2),
        },
      ],
    }
  })

  // Board markdown
  server.registerResource('board-markdown', new ResourceTemplate('automd://boards/{boardId}/markdown', { list: undefined }), {
    description: 'Raw markdown content of a board',
    mimeType: 'text/markdown',
  }, async (uri, { boardId }) => {
    const board = await api.getFile(boardId as string)
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: board.markdown,
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
