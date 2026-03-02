import { useUiStore } from '@/store/ui-store'
import { SplitView } from '@/components/editor/SplitView'
import { MarkdownEditor } from '@/components/editor/MarkdownEditor'
import { DocumentPage } from './DocumentPage'

export function DocumentView() {
  const showSplitEditor = useUiStore((s) => s.showSplitEditor)

  if (showSplitEditor) {
    return <SplitView left={<MarkdownEditor />} right={<DocumentPage />} />
  }

  return <DocumentPage />
}
