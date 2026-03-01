import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Root } from 'mdast'
import type { BoardMeta, BoardVocabulary, LabelGroupDef, RetentionConfig } from './types.js'

/**
 * Extract BoardMeta from a parsed AST's frontmatter (yaml) node.
 * Returns null if no frontmatter is present.
 */
export function extractFrontmatter(ast: Root): BoardMeta | null {
  const yamlNode = ast.children[0]
  if (!yamlNode || yamlNode.type !== 'yaml') return null

  try {
    const data = parseYaml((yamlNode as { value: string }).value)
    if (!data || typeof data !== 'object') return null

    return {
      board: data.board ?? undefined,
      project: data.project ?? undefined,
      projectId: data.projectId ?? undefined,
      description: data.description ?? undefined,
      tags: Array.isArray(data.tags) ? data.tags : undefined,
      retention: parseRetentionConfig(data.retention),
      archiveFor: typeof data.archiveFor === 'string' ? data.archiveFor : undefined,
      backlogFor: typeof data.backlogFor === 'string' ? data.backlogFor : undefined,
      vocabulary: parseVocabulary(data.vocabulary),
    }
  } catch {
    return null
  }
}

function parseRetentionConfig(raw: unknown): RetentionConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  const config: RetentionConfig = {}
  const obj = raw as Record<string, unknown>

  if (typeof obj.archive_done_after === 'number' && obj.archive_done_after > 0) {
    config.archiveDoneAfter = obj.archive_done_after
  }
  if (typeof obj.delete_archived_after === 'number' && obj.delete_archived_after > 0) {
    config.deleteArchivedAfter = obj.delete_archived_after
  }

  return Object.keys(config).length > 0 ? config : undefined
}

function parseVocabulary(raw: unknown): BoardVocabulary | undefined {
  if (!raw || typeof raw !== 'object') return undefined

  const obj = raw as Record<string, unknown>
  const vocab: BoardVocabulary = {}

  if (typeof obj.item_label === 'string') vocab.item_label = obj.item_label
  if (typeof obj.hide_completion === 'boolean') vocab.hide_completion = obj.hide_completion
  if (Array.isArray(obj.views)) vocab.views = obj.views.filter((v): v is string => typeof v === 'string')

  if (obj.groups && typeof obj.groups === 'object') {
    const groups: Record<string, LabelGroupDef> = {}
    for (const [key, val] of Object.entries(obj.groups as Record<string, unknown>)) {
      if (val && typeof val === 'object') {
        const g = val as Record<string, unknown>
        if (Array.isArray(g.options)) {
          groups[key] = {
            options: g.options.filter((o): o is string => typeof o === 'string'),
            style: (['badge', 'pipeline', 'dot'].includes(g.style as string) ? g.style : undefined) as LabelGroupDef['style'],
          }
        }
      }
    }
    if (Object.keys(groups).length > 0) vocab.groups = groups
  }

  return Object.keys(vocab).length > 0 ? vocab : undefined
}

/**
 * Convert BoardMeta to a YAML-friendly object with snake_case retention keys.
 */
function metaToYaml(meta: BoardMeta): Record<string, unknown> {
  const result: Record<string, unknown> = { ...meta }
  if (meta.retention) {
    const r: Record<string, number> = {}
    if (meta.retention.archiveDoneAfter !== undefined) r.archive_done_after = meta.retention.archiveDoneAfter
    if (meta.retention.deleteArchivedAfter !== undefined) r.delete_archived_after = meta.retention.deleteArchivedAfter
    result.retention = r
  }
  if (meta.vocabulary) {
    const v: Record<string, unknown> = {}
    if (meta.vocabulary.item_label) v.item_label = meta.vocabulary.item_label
    if (meta.vocabulary.hide_completion) v.hide_completion = meta.vocabulary.hide_completion
    if (meta.vocabulary.views) v.views = meta.vocabulary.views
    if (meta.vocabulary.groups) v.groups = meta.vocabulary.groups
    result.vocabulary = v
  }
  return result
}

/**
 * Set or update frontmatter in an AST. Mutates the AST in place.
 * If frontmatter already exists, updates it. Otherwise, prepends a new yaml node.
 */
export function setFrontmatter(ast: Root, meta: BoardMeta): void {
  const yamlValue = stringifyYaml(metaToYaml(meta), { lineWidth: 0 }).trim()

  if (ast.children[0]?.type === 'yaml') {
    ;(ast.children[0] as { value: string }).value = yamlValue
  } else {
    ast.children.unshift({
      type: 'yaml' as 'yaml',
      value: yamlValue,
    } as unknown as Root['children'][0])
  }
}

/**
 * Remove frontmatter from an AST if present. Mutates the AST in place.
 */
export function removeFrontmatter(ast: Root): void {
  if (ast.children[0]?.type === 'yaml') {
    ast.children.splice(0, 1)
  }
}
