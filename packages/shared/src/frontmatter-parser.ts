import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Root } from 'mdast'
import type { BoardMeta, RetentionConfig } from './types.js'

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
