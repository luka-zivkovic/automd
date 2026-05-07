import { useEffect, useMemo, useState } from 'react'
import { Bot, BookOpen, Github, Loader2, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAgentsStore } from '@/store/agents-store'
import { useFilesStore } from '@/store/files-store'
import { parseMarkdown } from '@/lib/markdown/parser'
import { annotateIds, createIdCache } from '@/lib/markdown/id-annotator'
import { extractTasksAndColumns } from '@/lib/markdown/task-extractor'

export function AgentListView() {
  const {
    agents,
    skills,
    skillsError,
    isImportingSkill,
    loadAgents,
    loadSkills,
    createAgent,
    importSkill,
    setSelectedAgentId,
  } = useAgentsStore()
  const files = useFilesStore((s) => s.files)
  const [name, setName] = useState('')
  const [skillUrl, setSkillUrl] = useState('')
  const [skillSlug, setSkillSlug] = useState('')
  const [overwriteSkill, setOverwriteSkill] = useState(false)

  useEffect(() => {
    loadAgents()
    loadSkills()
  }, [loadAgents, loadSkills])

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

  async function importGithubSkill() {
    if (!skillUrl.trim()) return
    const imported = await importSkill(skillUrl.trim(), {
      slug: skillSlug.trim() || undefined,
      overwrite: overwriteSkill,
    })
    if (imported) {
      setSkillUrl('')
      setSkillSlug('')
      setOverwriteSkill(false)
    }
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

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-primary" /> Skill library
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px_auto] gap-2">
              <input
                className="px-3 py-2 rounded-md border bg-background text-sm"
                placeholder="GitHub skill URL"
                value={skillUrl}
                onChange={(e) => setSkillUrl(e.target.value)}
              />
              <input
                className="px-3 py-2 rounded-md border bg-background text-sm"
                placeholder="Slug (optional)"
                value={skillSlug}
                onChange={(e) => setSkillSlug(e.target.value)}
              />
              <Button onClick={importGithubSkill} disabled={isImportingSkill || !skillUrl.trim()}>
                {isImportingSkill ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
                Import
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={overwriteSkill}
                onChange={(e) => setOverwriteSkill(e.target.checked)}
              />
              Overwrite an existing skill with the same slug
            </label>
            {skillsError && <p className="text-xs text-destructive">{skillsError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {skills.map((skill) => (
                <div key={skill.slug} className="rounded-md border bg-muted/20 p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{skill.name}</span>
                    <Badge variant="outline">/{skill.slug}</Badge>
                  </div>
                  {skill.description && <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>}
                  {skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {skill.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                    </div>
                  )}
                </div>
              ))}
              {skills.length === 0 && <p className="text-sm text-muted-foreground">No skills imported yet.</p>}
            </div>
          </CardContent>
        </Card>

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
