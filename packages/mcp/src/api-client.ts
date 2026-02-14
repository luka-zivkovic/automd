const BASE_URL = process.env.AUTOMD_SERVER_URL ?? 'http://localhost:4800'

const MAX_RETRIES = 3
const BASE_DELAY = 500
const RETRY_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly method: string,
    public readonly body: string,
  ) {
    let hint = ''
    switch (status) {
      case 400:
        hint = 'Check that all required parameters are provided and correctly formatted.'
        break
      case 404:
        hint = 'The requested resource does not exist. Use list_boards to see available board IDs.'
        break
      case 409:
        hint = 'The resource was modified by another client. Re-fetch the resource and retry your operation.'
        break
      case 413:
        hint = 'Request body too large. Reduce the content size.'
        break
      default:
        hint = 'An unexpected server error occurred. Try again or check server logs.'
    }
    super(
      `API ${method} ${path} failed (${status}): ${body}\nHint: ${hint}`,
    )
    this.name = 'ApiError'
  }
}

class ConnectionError extends Error {
  constructor(cause: unknown) {
    super(
      `Cannot connect to automd server at ${BASE_URL}. ` +
      `Ensure the server is running (npx automd-server or pnpm --filter @automd/server dev). ` +
      `Original error: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
    this.name = 'ConnectionError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request(path: string, options?: RequestInit) {
  const method = options?.method ?? 'GET'
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      })

      if (!res.ok) {
        const body = await res.text()

        // Retry on transient HTTP errors
        if (RETRY_STATUS_CODES.has(res.status) && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt)
          await sleep(delay)
          continue
        }

        throw new ApiError(res.status, path, method, body)
      }

      if (res.status === 204) return null
      return res.json()
    } catch (err) {
      // Don't retry our own API errors (non-transient)
      if (err instanceof ApiError) throw err

      // Network errors (ECONNREFUSED, ECONNRESET, etc.) — retry
      if (attempt < MAX_RETRIES) {
        lastError = err as Error
        const delay = BASE_DELAY * Math.pow(2, attempt)
        await sleep(delay)
        continue
      }

      throw new ConnectionError(err)
    }
  }

  throw lastError ?? new Error('Unexpected retry loop exit')
}

export const api = {
  // Files
  listFiles: () => request('/api/files'),
  getFile: (id: string) => request(`/api/files/${id}`),
  createFile: (name: string, markdown?: string, projectId?: string) =>
    request('/api/files', {
      method: 'POST',
      body: JSON.stringify({ name, markdown, projectId }),
    }),
  updateFile: (id: string, data: { markdown?: string; name?: string }) =>
    request(`/api/files/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFile: (id: string) =>
    request(`/api/files/${id}`, { method: 'DELETE' }),

  // Tasks
  listTasks: (fileId: string) => request(`/api/files/${fileId}/tasks`),
  addTask: (fileId: string, columnId: string, content: string) =>
    request(`/api/files/${fileId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ columnId, content }),
    }),
  updateTask: (fileId: string, taskId: string, data: Record<string, unknown>) =>
    request(`/api/files/${fileId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteTask: (fileId: string, taskId: string) =>
    request(`/api/files/${fileId}/tasks/${taskId}`, { method: 'DELETE' }),

  // Columns
  renameColumn: (fileId: string, columnId: string, title: string) =>
    request(`/api/files/${fileId}/columns/${columnId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'rename', title }),
    }),
  deleteColumn: (fileId: string, columnId: string) =>
    request(`/api/files/${fileId}/columns/${columnId}`, { method: 'DELETE' }),

  // Projects
  listProjects: () => request('/api/projects'),
  createProject: (name: string, color?: string) =>
    request('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    }),
  updateProject: (id: string, data: Record<string, unknown>) =>
    request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    request(`/api/projects/${id}`, { method: 'DELETE' }),

  // Health
  health: () => request('/api/health'),
}
