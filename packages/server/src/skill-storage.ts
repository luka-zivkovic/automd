import fs from 'node:fs'
import path from 'node:path'
import type { Agent, Skill } from '@automd/shared'
import { getAutomdDir } from './config.js'

function skillsDir() { return path.join(getAutomdDir(), 'skills') }
function skillPath(slug: string) { return path.join(skillsDir(), slug, 'SKILL.md') }

export function slugifySkill(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill'
}

function ensureDir(slug?: string) {
  fs.mkdirSync(slug ? path.join(skillsDir(), slug) : skillsDir(), { recursive: true })
}

function parseScalar(value: string): string | string[] {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return trimmed.replace(/^['"]|['"]$/g, '')
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed) } catch { return {} }
  }

  const meta: Record<string, unknown> = {}
  for (const line of trimmed.split('\n')) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    meta[match[1]] = parseScalar(match[2])
  }
  return meta
}

function cleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLen) : null
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => slugifySkill(v))
    .filter(Boolean)
    .slice(0, 50)
}

function firstParagraph(body: string): string | null {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s+.*$/gm, '').trim())
    .find(Boolean)
  return paragraph ? paragraph.slice(0, 500) : null
}

function parseSkillMarkdown(markdown: string, fallbackSlug: string, updatedAt: number): Skill {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(markdown)
  const meta = match ? parseFrontmatter(match[1]) : {}
  const body = (match ? match[2] : markdown).trimStart()
  const name = cleanString(meta.name, 200) ?? fallbackSlug
  const slug = fallbackSlug
  const tags = cleanStringArray(meta.tags)

  return {
    slug,
    name,
    description: cleanString(meta.description, 500) ?? firstParagraph(body),
    tags,
    updatedAt,
    body,
  }
}

export function listSkills(): Skill[] {
  ensureDir()
  return fs.readdirSync(skillsDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getSkill(entry.name))
    .filter((skill): skill is Skill => !!skill)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkill(slug: string): Skill | null {
  const normalized = slugifySkill(slug)
  const filePath = skillPath(normalized)
  if (!fs.existsSync(filePath)) return null
  const stat = fs.statSync(filePath)
  return parseSkillMarkdown(fs.readFileSync(filePath, 'utf-8'), normalized, stat.mtimeMs)
}

export function listSkillsForAgent(agent: Agent): Skill[] {
  const requested = new Set((agent.skills ?? []).map(slugifySkill))
  if (requested.size === 0) return []
  return listSkills().filter((skill) => requested.has(skill.slug))
}
