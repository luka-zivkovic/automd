import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { apiFetch, HAS_SERVER } from '@/lib/api'
import { useFilesStore } from '@/store/files-store'
import { useUserStore } from '@/store/user-store'
import type { Comment } from '@/lib/markdown/types'

export function CommentsPanel({ taskId }: { taskId: string }) {
  const activeFileId = useFilesStore((s) => s.activeFileId)
  const username = useUserStore((s) => s.username) || 'human'
  const [comments, setComments] = useState<Comment[]>([])
  const [body, setBody] = useState('')

  async function load() {
    if (!HAS_SERVER || !activeFileId) return
    const res = await apiFetch<{ comments: Comment[] }>(`/files/${activeFileId}/tasks/${taskId}/comments`)
    if (res.ok) setComments(res.data.comments)
  }

  useEffect(() => { load() }, [activeFileId, taskId])

  async function add() {
    if (!body.trim() || !activeFileId) return
    const res = await apiFetch<Comment>(`/files/${activeFileId}/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ author: username.replace(/^@/, ''), body: body.trim() }),
    })
    if (res.ok) {
      setComments((c) => [...c, res.data])
      setBody('')
    }
  }

  if (!HAS_SERVER) return <p className="text-xs text-muted-foreground">Comments require server mode.</p>

  function formatCreatedAt(value: string) {
    if (!value) return 'manual'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'manual' : date.toLocaleString()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="text-[11px] text-muted-foreground mb-1">@{comment.author} · {formatCreatedAt(comment.createdAt)}</div>
            <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      </div>
      <textarea className="w-full min-h-20 rounded-md border bg-background p-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add progress, question, or review note…" />
      <Button size="sm" onClick={add} disabled={!body.trim()}>Comment</Button>
    </div>
  )
}
