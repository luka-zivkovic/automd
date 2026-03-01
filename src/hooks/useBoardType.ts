import { useMemo } from 'react'
import { useFilesStore } from '@/store/files-store'

export type BoardType = 'active' | 'archive' | 'backlog'

export function useBoardType(): { boardType: BoardType; parentBoardId: string | null } {
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const files = useFilesStore((s) => s.files)

  return useMemo(() => {
    if (!activeFileId) return { boardType: 'active' as const, parentBoardId: null }

    for (const file of files) {
      if (file.archiveBoardId === activeFileId) {
        return { boardType: 'archive' as const, parentBoardId: file.id }
      }
      if (file.backlogBoardId === activeFileId) {
        return { boardType: 'backlog' as const, parentBoardId: file.id }
      }
    }

    return { boardType: 'active' as const, parentBoardId: activeFileId }
  }, [activeFileId, files])
}
