import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'

export function useKnownAssignees(): string[] {
  const tasks = useDocumentStore((s) => s.tasks)
  const set = new Set<string>()
  for (const task of tasks) {
    for (const a of task.metadata.assignees) set.add(a)
  }
  return Array.from(set).sort()
}

export function useKnownLabels(): string[] {
  const tasks = useDocumentStore((s) => s.tasks)
  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)
  const activeFileId = useFilesStore((s) => s.activeFileId)

  const set = new Set<string>()

  // Task-level labels from current document
  for (const task of tasks) {
    for (const l of task.metadata.labels) set.add(l)
  }

  // Project-level curated tags
  const activeFile = files.find((f) => f.id === activeFileId)
  if (activeFile?.projectId) {
    const project = projects.find((p) => p.id === activeFile.projectId)
    if (project?.tags) {
      for (const t of project.tags) set.add(t)
    }
  }

  return Array.from(set).sort()
}
