import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { Root } from 'mdast'
import type { Task, Column, IdCache } from '@/lib/markdown/types'
import { parseMarkdown } from '@/lib/markdown/parser'
import { serializeAst } from '@/lib/markdown/serializer'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'
import {
  toggleTask as toggleTaskMutation,
  moveTask as moveTaskMutation,
  addTask as addTaskMutation,
  updateTaskContent as updateTaskMutation,
  updateTaskMetadata as updateTaskMetadataMutation,
  deleteTask as deleteTaskMutation,
} from '@/lib/markdown/task-mutator'
import type { TaskMetadata } from '@/lib/markdown/types'
import { DEFAULT_MARKDOWN } from '@/lib/markdown/default-document'
import { nanoid } from 'nanoid'
import { useUserStore } from './user-store'

interface DocumentStore {
  // State
  markdown: string
  ast: Root | null
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
  idCache: IdCache

  // Actions from markdown editor
  setMarkdown: (md: string) => void
  reparseFromMarkdown: (md: string) => void

  // Actions from UI
  toggleTask: (taskId: string) => void
  moveTask: (
    taskId: string,
    targetColumnId: string,
    targetIndex: number
  ) => void
  addTask: (columnId: string, content: string) => void
  updateTaskContent: (taskId: string, content: string) => void
  updateTaskMetadata: (taskId: string, displayContent: string, metadata: Partial<TaskMetadata>) => void
  deleteTask: (taskId: string) => void

  // Internal: apply an AST mutation and re-derive everything
  _applyAstMutation: (mutator: (ast: Root) => Root) => void
}

function cloneCache(cache: IdCache): IdCache {
  return {
    fingerprints: new Map(cache.fingerprints),
    ids: new Map(cache.ids),
  }
}

function deriveState(markdown: string, cache: IdCache) {
  const rawAst = parseMarkdown(markdown)
  const mutableCache = cloneCache(cache)
  const ast = annotateIds(rawAst, mutableCache)
  const { tasks, columns, taskMap } = extractTasksAndColumns(ast)
  return { ast, tasks, columns, taskMap, idCache: mutableCache }
}

export const useDocumentStore = create<DocumentStore>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        // Initial state
        markdown: DEFAULT_MARKDOWN,
        ast: null as Root | null,
        tasks: [] as Task[],
        columns: [] as Column[],
        taskMap: new Map<string, Task>(),
        idCache: createIdCache(),

        setMarkdown: (md: string) => {
          set((state) => {
            state.markdown = md
          })
        },

        reparseFromMarkdown: (md: string) => {
          const cache = get().idCache
          const derived = deriveState(md, cache)
          set((state) => {
            state.ast = derived.ast
            state.tasks = derived.tasks
            state.columns = derived.columns
            state.taskMap = derived.taskMap
            state.idCache = derived.idCache
          })
        },

        toggleTask: (taskId: string) => {
          const task = get().taskMap.get(taskId)
          const username = useUserStore.getState().username

          // When checking off a task, add built-by signature
          if (task && !task.checked && username && !task.metadata.builtBy) {
            get()._applyAstMutation((ast) => {
              const toggled = toggleTaskMutation(ast, taskId)
              return updateTaskMetadataMutation(
                toggled,
                taskId,
                task.displayContent,
                { ...task.metadata, builtBy: username }
              )
            })
          } else {
            get()._applyAstMutation((ast) => toggleTaskMutation(ast, taskId))
          }
        },

        moveTask: (
          taskId: string,
          targetColumnId: string,
          targetIndex: number
        ) => {
          get()._applyAstMutation((ast) =>
            moveTaskMutation(ast, taskId, targetColumnId, targetIndex)
          )
        },

        addTask: (columnId: string, content: string) => {
          const id = nanoid(10)
          const username = useUserStore.getState().username
          const fullContent = username
            ? `${content} created-by:${username}`
            : content
          get()._applyAstMutation((ast) =>
            addTaskMutation(ast, columnId, fullContent, id)
          )
        },

        updateTaskContent: (taskId: string, content: string) => {
          get()._applyAstMutation((ast) =>
            updateTaskMutation(ast, taskId, content)
          )
        },

        updateTaskMetadata: (taskId: string, displayContent: string, partial: Partial<TaskMetadata>) => {
          const task = get().taskMap.get(taskId)
          if (!task) return
          const merged: TaskMetadata = { ...task.metadata, ...partial }
          get()._applyAstMutation((ast) =>
            updateTaskMetadataMutation(ast, taskId, displayContent, merged)
          )
        },

        deleteTask: (taskId: string) => {
          get()._applyAstMutation((ast) =>
            deleteTaskMutation(ast, taskId)
          )
        },

        _applyAstMutation: (mutator: (ast: Root) => Root) => {
          const { ast, idCache } = get()
          if (!ast) return

          const newAst = mutator(ast)
          const newMarkdown = serializeAst(newAst)

          // Clone cache to avoid mutating Immer-frozen Maps
          const mutableCache = cloneCache(idCache)
          const annotated = annotateIds(newAst, mutableCache)
          const { tasks, columns, taskMap } =
            extractTasksAndColumns(annotated)

          set((state) => {
            state.markdown = newMarkdown
            state.ast = annotated
            state.tasks = tasks
            state.columns = columns
            state.taskMap = taskMap
            state.idCache = mutableCache
          })
        },
      })),
      {
        name: 'automd-document',
        partialize: (state) => ({ markdown: state.markdown }),
      }
    )
  )
)

// Initialize on first load (when not rehydrated from storage)
const initState = useDocumentStore.getState()
if (!initState.ast) {
  initState.reparseFromMarkdown(initState.markdown)
}
