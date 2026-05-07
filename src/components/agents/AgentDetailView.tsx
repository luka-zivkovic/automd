import { useEffect } from 'react'
import { BarChart3, Check, Clock, HelpCircle, RotateCcw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAgentsStore } from '@/store/agents-store'

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatDuration(ms: number | null) {
  if (ms === null) return '—'
  const hours = Math.round(ms / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function AgentDetailView() {
  const {
    agents,
    skills,
    metrics,
    selectedAgentId,
    setSelectedAgentId,
    loadAgentMetrics,
    loadSkills,
    updateAgentSkills,
  } = useAgentsStore()
  const agent = agents.find((a) => a.id === selectedAgentId || a.slug === selectedAgentId)
  const stat = agent ? (metrics[agent.id] ?? metrics[agent.slug]) : null

  useEffect(() => {
    if (agent) {
      loadAgentMetrics(agent.id)
      loadSkills()
    }
  }, [agent, loadAgentMetrics, loadSkills])

  async function toggleSkill(slug: string) {
    if (!agent) return
    const current = agent.skills ?? []
    const next = current.includes(slug)
      ? current.filter((skill) => skill !== slug)
      : [...current, slug]
    await updateAgentSkills(agent.id, next)
  }

  if (!agent) return null
  const attachedSkills = new Set(agent.skills ?? [])

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
        <Card>
          <CardHeader><CardTitle className="text-base">Metrics</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><BarChart3 className="size-3" /> Completion</div>
              <div className="text-xl font-semibold mt-1">{stat ? formatPercent(stat.completionRate) : '—'}</div>
              <div className="text-xs text-muted-foreground">{stat ? `${stat.completedTasks}/${stat.totalTasks} done` : 'Loading…'}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><Clock className="size-3" /> Avg cycle</div>
              <div className="text-xl font-semibold mt-1">{formatDuration(stat?.avgCycleTimeMs ?? null)}</div>
              <div className="text-xs text-muted-foreground">{stat?.cycleSampleSize ?? 0} completed</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><RotateCcw className="size-3" /> Reopens</div>
              <div className="text-xl font-semibold mt-1">{stat?.reopenCount ?? '—'}</div>
              <div className="text-xs text-muted-foreground">{stat ? `${formatPercent(stat.reopenRate)} rate` : 'Loading…'}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><HelpCircle className="size-3" /> Needs help</div>
              <div className="text-xl font-semibold mt-1">{stat?.helpWantedTasks ?? '—'}</div>
              <div className="text-xs text-muted-foreground">{stat?.blockedTasks ?? 0} blocked</div>
            </div>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Capabilities</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
          {agent.capabilities.length ? agent.capabilities.join(', ') : 'No capabilities listed.'}
        </CardContent></Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Skills</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-3">
            <div className="flex flex-wrap gap-1">
              {agent.skills?.length
                ? agent.skills.map((skill) => <Badge key={skill} variant="secondary">/{skill}</Badge>)
                : <span className="text-muted-foreground">No skills attached.</span>}
            </div>
            {skills.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Attach imported skills to this agent.</p>
                <div className="grid grid-cols-1 gap-2">
                  {skills.map((skill) => {
                    const attached = attachedSkills.has(skill.slug)
                    return (
                      <button
                        key={skill.slug}
                        type="button"
                        className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-2 text-left hover:border-primary/40"
                        onClick={() => toggleSkill(skill.slug)}
                      >
                        <span>
                          <span className="block font-medium text-foreground">{skill.name}</span>
                          <span className="block text-xs text-muted-foreground">/{skill.slug}</span>
                        </span>
                        {attached ? <Check className="size-4 text-primary mt-0.5" /> : <span className="text-xs text-muted-foreground mt-0.5">Attach</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
