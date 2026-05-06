import { useEffect, useMemo, useState } from 'react'
import { Bot, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAgentsStore } from '@/store/agents-store'
import { useFilesStore } from '@/store/files-store'
import { parseMarkdown } from '@/lib/markdown/parser'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'

export function AgentListView() {
  const { agents, loadAgents, createAgent, setSelectedAgentId } = useAgentsStore()
  const files = useFilesStore((s) => s.files)
  const [name, setName] = useState('')

  useEffect(() => { loadAgents() }, [loadAgents])

  const counts = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    for (const file of files) {
      try {
        const ast = annotateIds(parseMarkdown(file.markdown), createIdCache())
        const { tasks } = extractTasksAndColumns(ast)
        for (const task of tasks) {
          const slug = task.metadata.builtBy
          if (!slug) continue
          const entry = map.get(slug) ?? { total: 0, done: 0 }
          entry.total++
          if (task.checked) entry.done++
          map.set(slug, entry)
        }
      } catch {}
    }
    return map
  }, [files])

  async function addAgent() {
    if (!name.trim()) return
    await createAgent(name.trim())
    setName('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="font-display text-3xl text-foreground italic">Agents</h2>
            <p className="text-sm text-muted-foreground mt-1">Your coding-agent teammate fleet.</p>
          </div>
          <div className="flex gap-2">
            <input className="px-3 py-2 rounded-md border bg-background text-sm" placeholder="New agent name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={addAgent}><Plus className="size-4" /> Add</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map((agent) => {
            const stat = counts.get(agent.slug) ?? { total: 0, done: 0 }
            return (
              <Card key={agent.id} className="cursor-pointer hover:border-primary/30" onClick={() => setSelectedAgentId(agent.id)}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="size-4 text-primary" /> {agent.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>@{agent.slug} · {agent.status}</p>
                  <p>{agent.runtime} {agent.model ? `· ${agent.model}` : ''}</p>
                  <p>{stat.done}/{stat.total} tasks done</p>
                  {(agent.skills?.length ?? 0) > 0 && <p>{agent.skills.length} skills attached</p>}
                  {agent.capabilities.length > 0 && <p>{agent.capabilities.join(', ')}</p>}
                </CardContent>
              </Card>
            )
          })}
          {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents yet. Add one or run the migration endpoint.</p>}
        </div>
      </div>
    </div>
  )
}
