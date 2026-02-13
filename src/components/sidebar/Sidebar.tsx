import { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useUiStore } from '@/store/ui-store'
import { useFilesStore } from '@/store/files-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FileListItem } from './FileListItem'
import { CreateFileButton } from './CreateFileButton'
import { ProjectSection } from './ProjectSection'
import { CreateProjectDialog } from './CreateProjectDialog'
import { FolderPlus } from 'lucide-react'
import type { BoardFile } from '@/lib/markdown/types'

/**
 * Droppable wrapper for the ungrouped files area.
 * Must be a child component of DndContext so useDroppable is properly registered.
 */
function UngroupedDropZone({
  ungroupedFiles,
  ungroupedFileIds,
  activeFileId,
  hasProjects,
}: {
  ungroupedFiles: BoardFile[]
  ungroupedFileIds: string[]
  activeFileId: string | null
  hasProjects: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'ungrouped-drop-zone',
    data: { type: 'sidebar-ungrouped' },
  })

  return (
    <div ref={setNodeRef}>
      <div className={`transition-colors duration-150 rounded-md ${isOver ? 'bg-primary/5' : ''}`}>
        <SortableContext
          items={ungroupedFileIds}
          strategy={verticalListSortingStrategy}
        >
          {ungroupedFiles.map((file) => (
            <FileListItem
              key={file.id}
              file={file}
              isActive={file.id === activeFileId}
            />
          ))}
        </SortableContext>

        {/* Drop hint when dragging over ungrouped area with no files */}
        {isOver && ungroupedFiles.length === 0 && hasProjects && (
          <p className="text-[11px] text-primary/70 px-2 py-2">
            Drop here to ungroup...
          </p>
        )}
      </div>
    </div>
  )
}

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const files = useFilesStore((s) => s.files)
  const projects = useFilesStore((s) => s.projects)
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const moveFileToProject = useFilesStore((s) => s.moveFileToProject)
  const reorderFiles = useFilesStore((s) => s.reorderFiles)

  const [showCreateProject, setShowCreateProject] = useState(false)
  const [activeDragFile, setActiveDragFile] = useState<BoardFile | null>(null)

  // Group files by project
  const ungroupedFiles = useMemo(
    () => files.filter((f) => f.projectId === null),
    [files]
  )

  const filesByProject = useMemo(() => {
    const map = new Map<string, typeof files>()
    for (const project of projects) {
      map.set(
        project.id,
        files.filter((f) => f.projectId === project.id)
      )
    }
    return map
  }, [files, projects])

  const ungroupedFileIds = useMemo(
    () => ungroupedFiles.map((f) => f.id),
    [ungroupedFiles]
  )

  // Separate DndContext sensors for sidebar (does not interfere with kanban)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  // Build a lookup: fileId -> projectId (null for ungrouped)
  const fileProjectMap = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const file of files) {
      map.set(file.id, file.projectId)
    }
    return map
  }, [files])

  // Custom collision detection: try pointer-based first, fall back to rect intersection, then closest center
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions

    const rectCollisions = rectIntersection(args)
    if (rectCollisions.length > 0) return rectCollisions

    return closestCenter(args)
  }, [])

  function handleDragStart(event: DragStartEvent) {
    const file = event.active.data.current?.file as BoardFile | undefined
    if (file) {
      setActiveDragFile(file)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragFile(null)

    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    const overId = over.id as string
    const overData = over.data.current

    // Determine if we dropped on a project droppable zone
    if (overData?.type === 'sidebar-project') {
      const targetProjectId = overData.projectId as string
      const currentProjectId = fileProjectMap.get(activeId)
      if (currentProjectId !== targetProjectId) {
        moveFileToProject(activeId, targetProjectId)
      }
      return
    }

    // Determine if we dropped on the ungrouped zone
    if (overId === 'ungrouped-drop-zone' || overData?.type === 'sidebar-ungrouped') {
      const currentProjectId = fileProjectMap.get(activeId)
      if (currentProjectId !== null) {
        moveFileToProject(activeId, null)
      }
      return
    }

    // Determine if we dropped on another file (for reordering)
    if (overData?.type === 'sidebar-file') {
      const overFile = overData.file as BoardFile
      const activeProjectId = fileProjectMap.get(activeId)
      const overProjectId = overFile.projectId

      // If dropping a file onto a file in a different project, move to that project
      if (activeProjectId !== overProjectId) {
        moveFileToProject(activeId, overProjectId)
      }

      // Now reorder: place the active file at the position of the over file
      // Get the relevant list of files (same project/group)
      const targetProjectId = overProjectId
      const relevantFiles = targetProjectId === null
        ? files.filter((f) => f.projectId === null)
        : files.filter((f) => f.projectId === targetProjectId)

      const oldIndex = relevantFiles.findIndex((f) => f.id === activeId)
      const newIndex = relevantFiles.findIndex((f) => f.id === overId)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        // Build new order for files in this group
        const ids = relevantFiles.map((f) => f.id)
        ids.splice(oldIndex, 1)
        ids.splice(newIndex, 0, activeId)

        // Build the full file order: maintain other groups, replace this group
        const otherFiles = files.filter((f) => f.projectId !== targetProjectId)
        const fullOrder = [
          ...otherFiles.map((f) => f.id),
          ...ids,
        ]
        reorderFiles(fullOrder)
      } else if (oldIndex === -1 && newIndex !== -1) {
        // File just moved to this group (cross-container). Insert at the over position.
        const idsWithoutActive = relevantFiles
          .filter((f) => f.id !== activeId)
          .map((f) => f.id)
        idsWithoutActive.splice(newIndex, 0, activeId)

        const otherFiles = files
          .filter((f) => f.projectId !== targetProjectId && f.id !== activeId)
        const fullOrder = [
          ...otherFiles.map((f) => f.id),
          ...idsWithoutActive,
        ]
        reorderFiles(fullOrder)
      }
      return
    }
  }

  return (
    <aside
      className="shrink-0 border-r border-border bg-background/50 backdrop-blur-sm overflow-hidden transition-all duration-300 ease-in-out"
      style={{ width: sidebarOpen ? 240 : 0 }}
    >
      <div className="w-[240px] h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Boards</h2>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowCreateProject(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <FolderPlus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">New Project</TooltipContent>
            </Tooltip>
            <CreateFileButton />
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="p-2 flex flex-col gap-0.5">
              {/* Create project inline form */}
              {showCreateProject && (
                <CreateProjectDialog onClose={() => setShowCreateProject(false)} />
              )}

              {/* Projects */}
              {projects.map((project) => (
                <ProjectSection
                  key={project.id}
                  project={project}
                  files={filesByProject.get(project.id) ?? []}
                  activeFileId={activeFileId}
                />
              ))}

              {/* Separator between projects and ungrouped files */}
              {projects.length > 0 && ungroupedFiles.length > 0 && (
                <div className="my-1.5 mx-2 h-px bg-border/50" />
              )}

              {/* Ungrouped files -- droppable zone (child component so useDroppable is inside DndContext) */}
              <UngroupedDropZone
                ungroupedFiles={ungroupedFiles}
                ungroupedFileIds={ungroupedFileIds}
                activeFileId={activeFileId}
                hasProjects={projects.length > 0}
              />

              {/* Empty state */}
              {files.length === 0 && projects.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No boards yet. Create one to get started.
                </p>
              )}
            </div>

            {/* Drag overlay -- shows simplified file preview */}
            <DragOverlay dropAnimation={null}>
              {activeDragFile && (
                <FileListItem
                  file={activeDragFile}
                  isActive={false}
                  isDragOverlay
                />
              )}
            </DragOverlay>
          </DndContext>
        </ScrollArea>
      </div>
    </aside>
  )
}
