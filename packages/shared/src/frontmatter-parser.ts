import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Root } from 'mdast'
import type { BoardMeta } from './types.js'

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
    }
  } catch {
    return null
  }
}

/**
 * Set or update frontmatter in an AST. Mutates the AST in place.
 * If frontmatter already exists, updates it. Otherwise, prepends a new yaml node.
 */
export function setFrontmatter(ast: Root, meta: BoardMeta): void {
  const yamlValue = stringifyYaml(meta, { lineWidth: 0 }).trim()

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
