import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAgentsStore } from '@/store/agents-store'

export function AgentDetailView() {
  const { agents, selectedAgentId, setSelectedAgentId } = useAgentsStore()
  const agent = agents.find((a) => a.id === selectedAgentId || a.slug === selectedAgentId)
  if (!agent) return null
  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-background border-l z-40 shadow-xl overflow-y-auto">
      <div className="p-4 flex items-center justify-between border-b">
        <h3 className="font-display text-xl italic">{agent.name}</h3>
        <Button variant="ghost" size="icon-sm" onClick={() => setSelectedAgentId(null)}><X className="size-4" /></Button>
      </div>
      <div className="p-4 space-y-3">
        <Card><CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader><CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>Slug: @{agent.slug}</p><p>Status: {agent.status}</p><p>Runtime: {agent.runtime}</p><p>Model: {agent.model ?? '—'}</p>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Capabilities</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
          {agent.capabilities.length ? agent.capabilities.join(', ') : 'No capabilities listed.'}
        </CardContent></Card>
      </div>
    </div>
  )
}
