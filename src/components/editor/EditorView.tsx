import { MarkdownEditor } from './MarkdownEditor'
import { LivePreview } from './LivePreview'
import { SplitView } from './SplitView'

export function EditorView() {
  return <SplitView left={<MarkdownEditor />} right={<LivePreview />} />
}
