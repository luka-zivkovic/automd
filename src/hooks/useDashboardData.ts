import { useMemo } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useUserStore } from '@/store/user-store'
import { useActivityStore, type ActivityEvent } from '@/store/activity-store'
import { parseMarkdown } from '@/lib/markdown/parser'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'
import { getDueDateStatus } from '@/lib/utils/metadata-colors'
import type { Task, Column } from '@/lib/markdown/types'

export interface DashboardTask {
  task: Task
  fileId: string
  fileName: string
  projectName: string | null
}

export interface BoardSummary {
  fileId: string
  fileName: string
  itemType: string
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  taskCount: number
  completedCount: number
  completionPercent: number
  overdueCount: number
  lastUpdated: number
  columnCount: number
}

export interface DashboardData {
  totalItems: number
  totalProjects: number
  totalTasks: number
  completedTasks: number
  completionPercent: number
  overdueCount: number
  knowledgeCount: number
  boards: BoardSummary[]
  myTasks: DashboardTask[]
  overdueTasks: DashboardTask[]
  builtByStats: { user: string; count: number }[]
  recentEvents: ActivityEvent[]
}

function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = []
  for (const task of tasks) {
    result.push(task)
    if (task.children.length > 0) {
      result.push(...flattenTasks(task.children))
    }
  }
  return result
}

export function useDashboardData(): DashboardData {
  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)
  const username = useUserStore((s) => s.username)
  const recentEvents = useActivityStore((s) => s.events)

  // Parse each file's markdown into tasks/columns
  const parsedFiles = useMemo(() => {
    return files.map((file) => {
      try {
        const ast = parseMarkdown(file.markdown)
        const cache = createIdCache()
        const annotated = annotateIds(ast, cache)
        const { tasks, columns } = extractTasksAndColumns(annotated)
        return { file, tasks, columns }
      } catch {
        return { file, tasks: [] as Task[], columns: [] as Column[] }
      }
    })
  }, [files])

  // Aggregate all non-archived tasks across files
  const allDashboardTasks = useMemo(() => {
    const result: DashboardTask[] = []
    for (const { file, columns } of parsedFiles) {
      const project = projects.find((p) => p.id === file.projectId)
      for (const col of columns) {
        const flat = flattenTasks(col.tasks)
        for (const task of flat) {
          if (!task.metadata.archived) {
            result.push({
              task,
              fileId: file.id,
              fileName: file.name,
              projectName: project?.name ?? null,
            })
          }
        }
      }
    }
    return result
  }, [parsedFiles, projects])

  // Board summaries
  const boards = useMemo<BoardSummary[]>(() => {
    return parsedFiles.map(({ file, columns }) => {
      const project = projects.find((p) => p.id === file.projectId)
      let taskCount = 0
      let completedCount = 0
      let overdueCount = 0

      for (const col of columns) {
        const flat = flattenTasks(col.tasks)
        for (const task of flat) {
          if (task.metadata.archived) continue
          taskCount++
          if (task.checked) completedCount++
          if (
            task.metadata.dueDate &&
            !task.checked &&
            getDueDateStatus(task.metadata.dueDate) === 'overdue'
          ) {
            overdueCount++
          }
        }
      }

      return {
        fileId: file.id,
        fileName: file.name,
        itemType: file.itemType ?? 'board',
        projectId: file.projectId,
        projectName: project?.name ?? null,
        projectColor: project?.color ?? null,
        taskCount,
        completedCount,
        completionPercent: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
        overdueCount,
        lastUpdated: file.updatedAt,
        columnCount: columns.length,
      }
    })
  }, [parsedFiles, projects])

  // Aggregate stats
  const totalTasks = allDashboardTasks.length
  const completedTasks = allDashboardTasks.filter((dt) => dt.task.checked).length
  const completionPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  // Overdue tasks
  const overdueTasks = useMemo(() => {
    return allDashboardTasks.filter(
      (dt) =>
        dt.task.metadata.dueDate &&
        !dt.task.checked &&
        getDueDateStatus(dt.task.metadata.dueDate) === 'overdue'
    )
  }, [allDashboardTasks])

  // My tasks
  const myTasks = useMemo(() => {
    if (!username) return []
    return allDashboardTasks.filter(
      (dt) =>
        dt.task.metadata.assignees.includes(username) &&
        !dt.task.checked
    )
  }, [allDashboardTasks, username])

  // Built-by stats
  const builtByStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const dt of allDashboardTasks) {
      if (dt.task.metadata.builtBy) {
        counts.set(dt.task.metadata.builtBy, (counts.get(dt.task.metadata.builtBy) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count)
  }, [allDashboardTasks])

  // Knowledge items count
  const knowledgeCount = useMemo(() => {
    return allDashboardTasks.filter((dt) => dt.task.metadata.knowledge).length
  }, [allDashboardTasks])

  return {
    totalItems: files.length,
    totalProjects: projects.length,
    totalTasks,
    completedTasks,
    completionPercent,
    overdueCount: overdueTasks.length,
    knowledgeCount,
    boards,
    myTasks,
    overdueTasks,
    builtByStats,
    recentEvents: recentEvents.slice(0, 8),
  }
}
