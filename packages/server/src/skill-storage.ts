import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import type { Agent, Skill } from '@automd/shared'
import { getAutomdDir } from './config.js'

function skillsDir() { return path.join(getAutomdDir(), 'skills') }
function skillPath(slug: string) { return path.join(skillsDir(), slug, 'SKILL.md') }

export const MAX_SKILL_BYTES = 256 * 1024

export class SkillExistsError extends Error {
  constructor(public readonly slug: string) {
    super(`Skill ${slug} already exists`)
    this.name = 'SkillExistsError'
  }
}

export class InvalidSkillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSkillError'
  }
}

export class SkillTooLargeError extends Error {
  constructor(public readonly slug: string, public readonly maxBytes: number) {
    super(`Skill ${slug} exceeds maximum size of ${maxBytes} bytes`)
    this.name = 'SkillTooLargeError'
  }
}

export type SkillSummary = Omit<Skill, 'body'>
export interface SkillSaveResult {
  skill: Skill
  created: boolean
}

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
  const lines = trimmed.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const key = match[1]
    const value = match[2]
    if (value.trim() === '') {
      const values: string[] = []
      while (i + 1 < lines.length) {
        const itemMatch = /^\s*-\s*(.*)$/.exec(lines[i + 1])
        if (!itemMatch) break
        values.push(itemMatch[1].trim().replace(/^['"]|['"]$/g, ''))
        i++
      }
      meta[key] = values.filter(Boolean)
    } else {
      meta[key] = parseScalar(value)
    }
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

function toSummary(skill: Skill): SkillSummary {
  const { body: _body, ...summary } = skill
  return summary
}

function readPreview(filePath: string, bytes: number): string {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    const read = fs.readSync(fd, buffer, 0, bytes, 0)
    return buffer.subarray(0, read).toString('utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

export function listSkills(): SkillSummary[] {
  ensureDir()
  return fs.readdirSync(skillsDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getSkillSummary(entry.name))
    .filter((skill): skill is SkillSummary => !!skill)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getSkillSummary(slug: string): SkillSummary | null {
  const normalized = slugifySkill(slug)
  const filePath = skillPath(normalized)
  if (!fs.existsSync(filePath)) return null
  const stat = fs.statSync(filePath)
  const preview = readPreview(filePath, Math.min(stat.size, MAX_SKILL_BYTES))
  return toSummary(parseSkillMarkdown(preview, normalized, stat.mtimeMs))
}

export function getSkill(slug: string): Skill | null {
  const normalized = slugifySkill(slug)
  const filePath = skillPath(normalized)
  if (!fs.existsSync(filePath)) return null
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_SKILL_BYTES) throw new SkillTooLargeError(normalized, MAX_SKILL_BYTES)
  return parseSkillMarkdown(fs.readFileSync(filePath, 'utf-8'), normalized, stat.mtimeMs)
}

export function saveSkillMarkdown(
  markdown: string,
  slug: string,
  options: { overwrite?: boolean } = {},
): SkillSaveResult {
  const normalized = slugifySkill(slug)
  const bytes = Buffer.byteLength(markdown, 'utf-8')
  if (!markdown.trim()) throw new InvalidSkillError('SKILL.md content is required')
  if (bytes > MAX_SKILL_BYTES) throw new SkillTooLargeError(normalized, MAX_SKILL_BYTES)

  const filePath = skillPath(normalized)
  const exists = fs.existsSync(filePath)
  if (exists && options.overwrite !== true) throw new SkillExistsError(normalized)

  ensureDir(normalized)
  const tmpPath = path.join(path.dirname(filePath), `.SKILL.md.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmpPath, `${markdown.trimEnd()}\n`, 'utf-8')
  fs.renameSync(tmpPath, filePath)

  const skill = getSkill(normalized)
  if (!skill) throw new InvalidSkillError('Saved skill could not be read')
  return { skill, created: !exists }
}

export function listSkillsForAgent(agent: Agent): Skill[] {
  const requested = new Set((agent.skills ?? []).map(slugifySkill))
  if (requested.size === 0) return []
  return Array.from(requested)
    .map((slug) => {
      try { return getSkill(slug) } catch { return null }
    })
    .filter((skill): skill is Skill => !!skill)
}
