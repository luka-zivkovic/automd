import { useMemo } from 'react'
import { useDocumentStore } from '@/store/document-store'
import { extractFrontmatter } from '@automd/shared'
import type { BoardVocabulary, LabelGroupDef } from '@automd/shared'
import type { ViewMode } from '@/store/ui-store'

const EMPTY_GROUPS: Record<string, LabelGroupDef> = {}
const ALL_VIEWS: ViewMode[] = ['editor', 'checklist', 'kanban']

export interface VocabularyContext {
  itemLabel: string
  labelGroups: Record<string, LabelGroupDef>
  availableViews: ViewMode[]
  hideCompletion: boolean
  /** Given a label like "stage-prospect", returns { group: "stage", value: "prospect" } if it belongs to a declared group */
  getGroupForLabel: (label: string) => { group: string; value: string } | null
  vocabulary: BoardVocabulary | null
}

export function useBoardVocabulary(): VocabularyContext {
  const ast = useDocumentStore((s) => s.ast)

  return useMemo(() => {
    const meta = ast ? extractFrontmatter(ast) : null
    const vocab = meta?.vocabulary ?? null

    const labelGroups = vocab?.groups ?? EMPTY_GROUPS

    function getGroupForLabel(label: string): { group: string; value: string } | null {
      for (const [groupName, groupDef] of Object.entries(labelGroups)) {
        const prefix = `${groupName}-`
        if (label.startsWith(prefix)) {
          const value = label.slice(prefix.length)
          if (groupDef.options.includes(value)) {
            return { group: groupName, value }
          }
        }
      }
      return null
    }

    return {
      itemLabel: vocab?.item_label ?? 'Task',
      labelGroups,
      availableViews: vocab?.views?.length
        ? vocab.views.filter((v): v is ViewMode => ALL_VIEWS.includes(v as ViewMode)) as ViewMode[]
        : ALL_VIEWS,
      hideCompletion: vocab?.hide_completion ?? false,
      getGroupForLabel,
      vocabulary: vocab,
    }
  }, [ast])
}
