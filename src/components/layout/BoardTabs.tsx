import { useMemo, useState } from 'react'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'
import { useBoardType } from '@/hooks/useBoardType'
import { apiFetch, HAS_SERVER } from '@/lib/api'
import type { BoardFile } from '@/lib/markdown/types'
import { Archive, Inbox, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BoardTabs() {
  const activeView = useUiStore((s) => s.activeView)
  const files = useFilesStore((s) => s.files)
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const addOrUpdateFile = useFilesStore((s) => s.addOrUpdateFile)
  const { boardType, parentBoardId } = useBoardType()

  const [isNavigating, setIsNavigating] = useState(false)

  // Don't show tabs on non-file views or when no board is selected or no server
  if (!HAS_SERVER || !activeFileId || activeView === 'home' || activeView === 'project-home' || activeView === 'memory') return null

  // Find the parent board (the "active" board that owns archive/backlog)
  const parentBoard = files.find((f) => f.id === parentBoardId)
  if (!parentBoard) return null

  // Get task counts from the document store for the active board is complex
  // Instead, use archive/backlog board existence as indicator
  const archiveBoardId = parentBoard.archiveBoardId
  const backlogBoardId = parentBoard.backlogBoardId

  async function navigateToBoard(targetType: 'active' | 'archive' | 'backlog') {
    if (isNavigating) return

    if (targetType === 'active') {
      if (parentBoardId) setActiveFile(parentBoardId)
      return
    }

    // Navigate to archive or backlog — create on-demand if needed
    setIsNavigating(true)
    try {
      const result = await apiFetch<BoardFile>(`/files/${parentBoardId}/${targetType}`, { method: 'POST' })
      if (!result.ok) return
      const board = result.data

      const fullResult = await apiFetch<{
        markdown?: string
        archiveBoardId?: string | null
        backlogBoardId?: string | null
      }>(`/files/${board.id}`)
      if (!fullResult.ok) return

      const fullBoard: BoardFile = {
        ...board,
        markdown: fullResult.data?.markdown ?? '',
        archiveBoardId: fullResult.data?.archiveBoardId ?? null,
        backlogBoardId: fullResult.data?.backlogBoardId ?? null,
      }
      addOrUpdateFile(fullBoard)
      addOrUpdateFile({
        ...parentBoard,
        [`${targetType}BoardId`]: board.id,
      } as BoardFile)
      setActiveFile(board.id)
    } finally {
      setIsNavigating(false)
    }
  }

  return (
    <div className="flex items-center gap-1 px-5 pb-2 -mt-1">
      <TabButton
        active={boardType === 'active'}
        onClick={() => navigateToBoard('active')}
        icon={<LayoutList className="size-3" />}
        label="Active"
      />
      <TabButton
        active={boardType === 'backlog'}
        onClick={() => navigateToBoard('backlog')}
        icon={<Inbox className="size-3" />}
        label="Backlog"
        subtle={!backlogBoardId}
      />
      <TabButton
        active={boardType === 'archive'}
        onClick={() => navigateToBoard('archive')}
        icon={<Archive className="size-3" />}
        label="Archive"
        subtle={!archiveBoardId}
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  subtle = false,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  subtle?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150',
        active
          ? 'bg-primary/10 text-primary'
          : subtle
            ? 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
