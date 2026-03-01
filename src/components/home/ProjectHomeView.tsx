import { useMemo } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { getProjectColorClass } from '@/lib/utils/project-colors'
import { formatRelativeDate } from '@/lib/format-relative-date'
import { Columns3, CheckSquare, FileText, ChevronRight, FolderOpen, type LucideIcon } from 'lucide-react'
import type { BoardFile, ItemType } from '@/lib/markdown/types'

// ── Helpers ──────────────────────────────────────────────────────────

const TYPE_ICONS: Record<ItemType, LucideIcon> = {
  board: Columns3,
  checklist: CheckSquare,
  note: FileText,
}

const TYPE_LABELS: Record<ItemType, string> = {
  board: 'Board',
  checklist: 'Checklist',
  note: 'Note',
}

/**
 * Lightweight task counting from raw markdown.
 * Tasks are H2 headings (`## `). Checked tasks have `## [x]` prefix.
 */
function countTasks(markdown: string): { total: number; completed: number } {
  const taskRegex = /^## /gm
  const total = (markdown.match(taskRegex) || []).length
  const checkedRegex = /^## \[x\]/gmi
  const completed = (markdown.match(checkedRegex) || []).length
  return { total, completed }
}

/**
 * Detect if a file's frontmatter declares it as an archive or backlog board.
 * Uses a simple regex to avoid full YAML parsing overhead.
 */
function isAuxiliaryBoard(markdown: string): boolean {
  const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return false
  const frontmatter = frontmatterMatch[1]
  return /^archiveFor:/m.test(frontmatter) || /^backlogFor:/m.test(frontmatter)
}

/**
 * Count words in markdown content (excluding frontmatter).
 */
function countWords(markdown: string): number {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const words = withoutFrontmatter.trim().split(/\s+/).filter(Boolean)
  return words.length
}

// ── Item Card ────────────────────────────────────────────────────────

interface ItemCardProps {
  file: BoardFile
  onClick: (file: BoardFile) => void
}

function ItemCard({ file, onClick }: ItemCardProps) {
  const Icon = TYPE_ICONS[file.itemType ?? 'board']
  const typeLabel = TYPE_LABELS[file.itemType ?? 'board']

  const stats = useMemo(() => {
    if (file.itemType === 'note') {
      return { type: 'note' as const, wordCount: countWords(file.markdown) }
    }
    const { total, completed } = countTasks(file.markdown)
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    return { type: 'tasks' as const, total, completed, percent }
  }, [file.markdown, file.itemType])

  return (
    <button onClick={() => onClick(file)} className="text-left group">
      <Card className="py-0 gap-0 card-hover transition-all h-full">
        <div className="p-4 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-7 rounded-md bg-secondary/80 flex items-center justify-center shrink-0">
              <Icon className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-[11px] text-muted-foreground">{typeLabel}</p>
            </div>
            <ChevronRight className="size-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
          </div>
        </div>
        <Separator />
        <div className="p-4 pt-3 flex items-center justify-between">
          {stats.type === 'tasks' ? (
            <div className="flex items-center gap-3">
              {stats.total > 0 ? (
                <>
                  <Progress value={stats.percent} className="w-20 h-1" />
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {stats.completed}/{stats.total}
                  </span>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">No tasks</span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {stats.wordCount > 0 ? `${stats.wordCount.toLocaleString()} words` : 'Empty'}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatRelativeDate(file.updatedAt)}
          </span>
        </div>
      </Card>
    </button>
  )
}

// ── Type Section Header ──────────────────────────────────────────────

function TypeSectionHeader({ icon: Icon, label, count }: {
  icon: LucideIcon
  label: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="size-3.5 text-muted-foreground/50" />
      <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {label}s
      </h3>
      <span className="text-[11px] tabular-nums text-muted-foreground/60">{count}</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────

export function ProjectHomeView() {
  const activeProjectId = useUiStore((s) => s.activeProjectId)
  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)

  const project = projects.find((p) => p.id === activeProjectId)

  // Filter files belonging to this project, excluding auxiliary (archive/backlog) boards
  const projectFiles = useMemo(() => {
    return files
      .filter((f) => f.projectId === activeProjectId)
      .filter((f) => !isAuxiliaryBoard(f.markdown))
  }, [files, activeProjectId])

  // Group files by type, sorted: boards first, then checklists, then notes
  const groupedFiles = useMemo(() => {
    const groups: { type: ItemType; icon: LucideIcon; label: string; files: BoardFile[] }[] = []

    const boards = projectFiles.filter((f) => (f.itemType ?? 'board') === 'board')
    const checklists = projectFiles.filter((f) => f.itemType === 'checklist')
    const notes = projectFiles.filter((f) => f.itemType === 'note')

    if (boards.length > 0) {
      groups.push({ type: 'board', icon: Columns3, label: 'Board', files: boards })
    }
    if (checklists.length > 0) {
      groups.push({ type: 'checklist', icon: CheckSquare, label: 'Checklist', files: checklists })
    }
    if (notes.length > 0) {
      groups.push({ type: 'note', icon: FileText, label: 'Note', files: notes })
    }

    return groups
  }, [projectFiles])

  // Aggregate stats for the project header
  const projectStats = useMemo(() => {
    let totalTasks = 0
    let completedTasks = 0

    for (const file of projectFiles) {
      if (file.itemType === 'note') continue
      const { total, completed } = countTasks(file.markdown)
      totalTasks += total
      completedTasks += completed
    }

    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    return { totalTasks, completedTasks, percent }
  }, [projectFiles])

  function handleItemClick(file: BoardFile) {
    setActiveFile(file.id)
    const defaultView = file.itemType === 'note'
      ? 'editor'
      : file.itemType === 'checklist'
        ? 'checklist'
        : 'kanban'
    setActiveView(defaultView)
  }

  // Fallback if project not found
  if (!project) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <FolderOpen className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">Project not found</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              This project may have been deleted or moved.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (projectFiles.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="empty-state-icon size-16 mx-auto mb-5 flex items-center justify-center">
              <FolderOpen className="size-7 text-muted-foreground" />
            </div>
            <h3 className="font-display text-2xl text-foreground italic">No items yet</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Add boards, checklists, or notes to{' '}
              <span className="font-medium text-foreground">{project.name}</span>{' '}
              from the sidebar.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* Project Header */}
          <div className="mb-8">
            <div className="flex items-end justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`size-4 rounded-full shrink-0 ${getProjectColorClass(project.color)}`} />
                <div>
                  <h2 className="font-display text-3xl text-foreground italic">{project.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {projectFiles.length} item{projectFiles.length !== 1 ? 's' : ''}
                    {projectStats.totalTasks > 0 && (
                      <> &middot; {projectStats.completedTasks} of {projectStats.totalTasks} tasks complete</>
                    )}
                  </p>
                </div>
              </div>
              {projectStats.totalTasks > 0 && (
                <span className="text-3xl font-light tabular-nums text-gradient">
                  {projectStats.percent}%
                </span>
              )}
            </div>
            {projectStats.totalTasks > 0 && (
              <Progress value={projectStats.percent} className="h-2" />
            )}
          </div>

          {/* Grouped Items */}
          {groupedFiles.map((group) => (
            <div key={group.type} className="mb-8">
              <TypeSectionHeader icon={group.icon} label={group.label} count={group.files.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-enter">
                {group.files.map((file) => (
                  <ItemCard key={file.id} file={file} onClick={handleItemClick} />
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}
