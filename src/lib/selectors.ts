import { useDocumentStore } from '@/store/document-store'

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
  const set = new Set<string>()
  for (const task of tasks) {
    for (const l of task.metadata.labels) set.add(l)
  }
  return Array.from(set).sort()
}
