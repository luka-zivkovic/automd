import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import type { BoardFile, ItemType, Project } from '@/lib/markdown/types'
import { DEFAULT_MARKDOWN } from '@/lib/markdown/default-document'

interface FilesStore {
  files: BoardFile[]
  activeFileId: string | null
  projects: Project[]

  createFile: (name: string, markdown?: string, projectId?: string | null, itemType?: ItemType) => string
  deleteFile: (fileId: string) => void
  renameFile: (fileId: string, name: string) => void
  updateFileMarkdown: (fileId: string, markdown: string) => void
  setActiveFile: (fileId: string) => void

  createProject: (name: string, color: string) => string
  deleteProject: (projectId: string) => void
  renameProject: (projectId: string, name: string) => void
  moveFileToProject: (fileId: string, projectId: string | null) => void
  reorderFiles: (fileIds: string[]) => void
  reorderProjects: (projectIds: string[]) => void
}

export const useFilesStore = create<FilesStore>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        files: [] as BoardFile[],
        activeFileId: null as string | null,
        projects: [] as Project[],

        createFile: (name: string, markdown?: string, projectId?: string | null, itemType?: ItemType): string => {
          const id = nanoid()
          const now = Date.now()
          const file: BoardFile = {
            id,
            name,
            markdown: markdown ?? DEFAULT_MARKDOWN,
            createdAt: now,
            updatedAt: now,
            projectId: projectId ?? null,
            itemType: itemType ?? 'board',
          }
          set((state) => {
            state.files.push(file)
          })
          return id
        },

        deleteFile: (fileId: string) => {
          const { files, activeFileId } = get()
          const remaining = files.filter((f) => f.id !== fileId)
          set((state) => {
            state.files = remaining
            if (activeFileId === fileId) {
              state.activeFileId = remaining.length > 0 ? remaining[0].id : null
            }
            // Remove from any project's fileIds
            for (const project of state.projects) {
              project.fileIds = project.fileIds.filter((id) => id !== fileId)
            }
          })
        },

        renameFile: (fileId: string, name: string) => {
          set((state) => {
            const file = state.files.find((f) => f.id === fileId)
            if (file) {
              file.name = name
              file.updatedAt = Date.now()
            }
          })
        },

        updateFileMarkdown: (fileId: string, markdown: string) => {
          set((state) => {
            const file = state.files.find((f) => f.id === fileId)
            if (file) {
              file.markdown = markdown
              file.updatedAt = Date.now()
            }
          })
        },

        setActiveFile: (fileId: string) => {
          set((state) => {
            state.activeFileId = fileId
          })
        },

        createProject: (name: string, color: string): string => {
          const id = nanoid()
          const now = Date.now()
          const project: Project = {
            id,
            name,
            color,
            fileIds: [],
            createdAt: now,
          }
          set((state) => {
            state.projects.push(project)
          })
          return id
        },

        deleteProject: (projectId: string) => {
          set((state) => {
            // Set all files in this project to ungrouped
            for (const file of state.files) {
              if (file.projectId === projectId) {
                file.projectId = null
              }
            }
            // Remove the project
            state.projects = state.projects.filter((p) => p.id !== projectId)
          })
        },

        renameProject: (projectId: string, name: string) => {
          set((state) => {
            const project = state.projects.find((p) => p.id === projectId)
            if (project) {
              project.name = name
            }
          })
        },

        moveFileToProject: (fileId: string, projectId: string | null) => {
          set((state) => {
            const file = state.files.find((f) => f.id === fileId)
            if (!file) return

            // Remove from old project's fileIds if applicable
            if (file.projectId) {
              const oldProject = state.projects.find((p) => p.id === file.projectId)
              if (oldProject) {
                oldProject.fileIds = oldProject.fileIds.filter((id) => id !== fileId)
              }
            }

            // Update file's projectId
            file.projectId = projectId

            // Add to new project's fileIds if applicable
            if (projectId) {
              const newProject = state.projects.find((p) => p.id === projectId)
              if (newProject && !newProject.fileIds.includes(fileId)) {
                newProject.fileIds.push(fileId)
              }
            }
          })
        },

        reorderFiles: (fileIds: string[]) => {
          set((state) => {
            const fileMap = new Map(state.files.map((f) => [f.id, f]))
            const ordered: typeof state.files = []
            for (const id of fileIds) {
              const file = fileMap.get(id)
              if (file) {
                ordered.push(file)
                fileMap.delete(id)
              }
            }
            // Append any remaining files not in the provided order
            for (const file of fileMap.values()) {
              ordered.push(file)
            }
            state.files = ordered
          })
        },

        reorderProjects: (projectIds: string[]) => {
          set((state) => {
            const projectMap = new Map(state.projects.map((p) => [p.id, p]))
            const ordered: typeof state.projects = []
            for (const id of projectIds) {
              const project = projectMap.get(id)
              if (project) {
                ordered.push(project)
                projectMap.delete(id)
              }
            }
            // Append any remaining projects not in the provided order
            for (const project of projectMap.values()) {
              ordered.push(project)
            }
            state.projects = ordered
          })
        },
      })),
      {
        name: 'automd-files',
      }
    )
  )
)
