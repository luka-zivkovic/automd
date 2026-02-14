const BASE_URL = process.env.AUTOMD_SERVER_URL ?? 'http://localhost:4800'

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }

  if (res.status === 204) return null
  return res.json()
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
