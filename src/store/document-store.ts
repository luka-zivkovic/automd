import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
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
  updateTaskDescription as updateTaskDescriptionMutation,
  deleteTask as deleteTaskMutation,
  addSubtask as addSubtaskMutation,
  toggleSubtask as toggleSubtaskMutation,
  deleteSubtask as deleteSubtaskMutation,
  addColumn as addColumnMutation,
  renameColumn as renameColumnMutation,
  deleteColumn as deleteColumnMutation,
  moveColumn as moveColumnMutation,
} from '@/lib/markdown/task-mutator'
import { extractFrontmatter, setFrontmatter } from '@automd/shared'
import type { TaskMetadata } from '@/lib/markdown/types'
import { nanoid } from 'nanoid'
import { useUserStore } from './user-store'

const MAX_HISTORY = 50

interface DocumentStore {
  // State
  markdown: string
  ast: Root | null
  tasks: Task[]
  columns: Column[]
  taskMap: Map<string, Task>
  idCache: IdCache

  // Undo/Redo
  _history: string[]
  _future: string[]
  canUndo: boolean
  canRedo: boolean

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
  updateTaskDescription: (taskId: string, description: string | null) => void
  deleteTask: (taskId: string) => void
  archiveTask: (taskId: string) => void
  unarchiveTask: (taskId: string) => void

  // Subtask actions
  addSubtask: (taskId: string, content: string) => void
  toggleSubtask: (subtaskId: string) => void
  deleteSubtask: (subtaskId: string) => void

  // Column actions
  addColumn: (title: string) => void
  renameColumn: (columnId: string, newTitle: string) => void
  deleteColumn: (columnId: string) => void
  moveColumn: (columnId: string, targetIndex: number) => void

  // Frontmatter actions
  updateFrontmatterTags: (tags: string[]) => void

  // Undo/Redo actions
  undo: () => void
  redo: () => void

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
    immer((set, get) => ({
      // Initial state — empty until useActiveFileSync loads the active file
      markdown: '',
        ast: null as Root | null,
        tasks: [] as Task[],
        columns: [] as Column[],
        taskMap: new Map<string, Task>(),
        idCache: createIdCache(),

        // Undo/Redo state
        _history: [] as string[],
        _future: [] as string[],
        canUndo: false,
        canRedo: false,

        setMarkdown: (md: string) => {
          set((state) => {
            state.markdown = md
          })
        },

        reparseFromMarkdown: (md: string) => {
          const cache = get().idCache
          const derived = deriveState(md, cache)
          set((state) => {
            state.markdown = md
            state.ast = derived.ast
            state.tasks = derived.tasks
            state.columns = derived.columns
            state.taskMap = derived.taskMap
            state.idCache = derived.idCache
            // Clear undo history (this is called on file switch)
            state._history = []
            state._future = []
            state.canUndo = false
            state.canRedo = false
          })
        },

        toggleTask: (taskId: string) => {
          const task = get().taskMap.get(taskId)
          const username = useUserStore.getState().username

          // When checking off a task, add built-by signature
          if (task && task.checked === false && username && !task.metadata.builtBy) {
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

        updateTaskDescription: (taskId: string, description: string | null) => {
          get()._applyAstMutation((ast) =>
            updateTaskDescriptionMutation(ast, taskId, description)
          )
        },

        deleteTask: (taskId: string) => {
          get()._applyAstMutation((ast) =>
            deleteTaskMutation(ast, taskId)
          )
        },

        archiveTask: (taskId: string) => {
          const task = get().taskMap.get(taskId)
          if (!task) return
          get()._applyAstMutation((ast) =>
            updateTaskMetadataMutation(ast, taskId, task.displayContent, { ...task.metadata, archived: true })
          )
        },

        unarchiveTask: (taskId: string) => {
          const task = get().taskMap.get(taskId)
          if (!task) return
          get()._applyAstMutation((ast) =>
            updateTaskMetadataMutation(ast, taskId, task.displayContent, { ...task.metadata, archived: false })
          )
        },

        addSubtask: (taskId: string, content: string) => {
          const id = nanoid(10)
          get()._applyAstMutation((ast) =>
            addSubtaskMutation(ast, taskId, content, id)
          )
        },

        toggleSubtask: (subtaskId: string) => {
          get()._applyAstMutation((ast) =>
            toggleSubtaskMutation(ast, subtaskId)
          )
        },

        deleteSubtask: (subtaskId: string) => {
          get()._applyAstMutation((ast) =>
            deleteSubtaskMutation(ast, subtaskId)
          )
        },

        addColumn: (title: string) => {
          get()._applyAstMutation((ast) =>
            addColumnMutation(ast, title)
          )
        },

        renameColumn: (columnId: string, newTitle: string) => {
          get()._applyAstMutation((ast) =>
            renameColumnMutation(ast, columnId, newTitle)
          )
        },

        deleteColumn: (columnId: string) => {
          get()._applyAstMutation((ast) =>
            deleteColumnMutation(ast, columnId)
          )
        },

        moveColumn: (columnId: string, targetIndex: number) => {
          get()._applyAstMutation((ast) =>
            moveColumnMutation(ast, columnId, targetIndex)
          )
        },

        updateFrontmatterTags: (tags: string[]) => {
          get()._applyAstMutation((ast) => {
            const currentMeta = extractFrontmatter(ast) ?? {}
            setFrontmatter(ast, { ...currentMeta, tags })
            return ast
          })
        },

        undo: () => {
          const { _history, markdown, idCache } = get()
          if (_history.length === 0) return

          const prev = _history[_history.length - 1]
          const newHistory = _history.slice(0, -1)
          const derived = deriveState(prev, idCache)

          set((state) => {
            state._future = [...state._future, markdown]
            state._history = newHistory
            state.markdown = prev
            state.ast = derived.ast
            state.tasks = derived.tasks
            state.columns = derived.columns
            state.taskMap = derived.taskMap
            state.idCache = derived.idCache
            state.canUndo = newHistory.length > 0
            state.canRedo = true
          })
        },

        redo: () => {
          const { _future, markdown, idCache } = get()
          if (_future.length === 0) return

          const next = _future[_future.length - 1]
          const newFuture = _future.slice(0, -1)
          const derived = deriveState(next, idCache)

          set((state) => {
            state._history = [...state._history, markdown]
            state._future = newFuture
            state.markdown = next
            state.ast = derived.ast
            state.tasks = derived.tasks
            state.columns = derived.columns
            state.taskMap = derived.taskMap
            state.idCache = derived.idCache
            state.canUndo = true
            state.canRedo = newFuture.length > 0
          })
        },

        _applyAstMutation: (mutator: (ast: Root) => Root) => {
          const { ast, idCache, markdown } = get()
          if (!ast) return

          // Push current markdown to history before mutating
          const history = [...get()._history, markdown].slice(-MAX_HISTORY)

          const newAst = mutator(ast)
          const newMarkdown = serializeAst(newAst)

          // Clone cache to avoid mutating Immer-frozen Maps
          const mutableCache = cloneCache(idCache)
          const annotated = annotateIds(newAst, mutableCache)
          const { tasks, columns, taskMap } =
            extractTasksAndColumns(annotated)

          set((state) => {
            state._history = history
            state._future = []
            state.canUndo = history.length > 0
            state.canRedo = false
            state.markdown = newMarkdown
            state.ast = annotated
            state.tasks = tasks
            state.columns = columns
            state.taskMap = taskMap
            state.idCache = mutableCache
          })
        },
      }))
  )
)
