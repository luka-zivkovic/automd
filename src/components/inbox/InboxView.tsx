import { useEffect, useState } from 'react'
import { Ban, Inbox, LifeBuoy, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { apiFetch, HAS_SERVER } from '@/lib/api'
import { useAgentsStore } from '@/store/agents-store'
import { useFilesStore } from '@/store/files-store'
import { useUiStore } from '@/store/ui-store'

interface InboxItem {
  id: string
  type: 'mention' | 'help_wanted' | 'blocked'
  itemId: string
  itemName: string
  taskId: string
  taskTitle: string
  column: string
  timestamp: number
  author?: string
  body?: string
  mentions?: string[]
  agentSlug?: string | null
}

interface InboxResponse {
  target: string | null
  count: number
  items: InboxItem[]
}

function itemIcon(type: InboxItem['type']) {
  if (type === 'mention') return <MessageSquare className="size-4 text-primary" />
  if (type === 'help_wanted') return <LifeBuoy className="size-4 text-amber-500" />
  return <Ban className="size-4 text-destructive" />
}

function itemLabel(type: InboxItem['type']) {
  if (type === 'mention') return 'Mention'
  if (type === 'help_wanted') return 'Help wanted'
  return 'Blocked'
}

export function InboxView() {
  const [target, setTarget] = useState<string>('all')
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(false)
  const { agents, loadAgents } = useAgentsStore()
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  useEffect(() => { loadAgents() }, [loadAgents])

  useEffect(() => {
    if (!HAS_SERVER) return
    setLoading(true)
    const path = target === 'all' ? '/inbox?all=true' : `/inbox?target=${encodeURIComponent(target)}`
    apiFetch<InboxResponse>(path).then((res) => {
      if (res.ok) setItems(res.data.items)
      setLoading(false)
    })
  }, [target])

  function openTask(item: InboxItem) {
    setActiveFile(item.itemId)
    setSelectedTaskId(item.taskId)
    setActiveView('kanban')
  }

  if (!HAS_SERVER) {
    return <div className="h-full overflow-y-auto p-6 text-sm text-muted-foreground">Inbox requires server mode.</div>
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-3xl text-foreground italic flex items-center gap-2">
              <Inbox className="size-7" /> Inbox
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Mentions, help requests, and blocked assigned work.</p>
          </div>
          <div className="flex gap-2">
            <Button variant={target === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTarget('all')}>All</Button>
            {agents.map((agent) => (
              <Button
                key={agent.id}
                variant={target === agent.slug ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTarget(agent.slug)}
              >
                @{agent.slug}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading inbox…</p>}
          {!loading && items.length === 0 && (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">Nothing needs attention.</CardContent>
            </Card>
          )}
          {items.map((item) => (
            <Card key={item.id} className="cursor-pointer hover:border-primary/30" onClick={() => openTask(item)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {itemIcon(item.type)}
                  {itemLabel(item.type)}
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div>
                  <p className="font-medium">{item.taskTitle}</p>
                  <p className="text-xs text-muted-foreground">{item.itemName} · {item.column}</p>
                </div>
                {item.body && (
                  <p className="rounded-md bg-muted/30 p-3 text-muted-foreground whitespace-pre-wrap">
                    {item.author ? `@${item.author}: ` : ''}{item.body}
                  </p>
                )}
                {item.agentSlug && <p className="text-xs text-muted-foreground">Assigned to @{item.agentSlug}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
