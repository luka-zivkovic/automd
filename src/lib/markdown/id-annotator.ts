import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import { nanoid } from 'nanoid'
import type { Root, Heading, ListItem, Content } from 'mdast'
import type { IdCache } from './types'

export function createIdCache(): IdCache {
  return {
    fingerprints: new Map(),
    ids: new Map(),
  }
}

function getNodeFingerprint(
  node: Heading | ListItem,
  index: number,
  scope: string
): string {
  const text = toString(node).slice(0, 80)
  return `${scope}:${node.type}:${index}:${text}`
}

function getOrCreateId(fingerprint: string, cache: IdCache): string {
  const existing = cache.fingerprints.get(fingerprint)
  if (existing) return existing
  const id = nanoid(10)
  cache.fingerprints.set(fingerprint, id)
  cache.ids.set(id, fingerprint)
  return id
}

/**
 * Build a map of which heading "owns" which range of root children.
 * Returns an array of { headingIndex, headingNode } for all H2s.
 */
function buildHeadingMap(ast: Root) {
  const headings: { index: number; node: Heading }[] = []
  for (let i = 0; i < ast.children.length; i++) {
    const child = ast.children[i]
    if (child.type === 'heading' && (child as Heading).depth === 2) {
      headings.push({ index: i, node: child as Heading })
    }
  }
  return headings
}

/**
 * Find which H2 heading a root-level child index falls under.
 */
function findOwningHeadingId(
  rootChildIndex: number,
  headingEntries: { index: number; id: string }[]
): string {
  let owning = '__root__'
  for (const entry of headingEntries) {
    if (entry.index <= rootChildIndex) {
      owning = entry.id
    } else {
      break
    }
  }
  return owning
}

export function annotateIds(ast: Root, cache: IdCache): Root {
  // First pass: annotate H2 headings
  const headingMap = buildHeadingMap(ast)
  let headingIndex = 0
  const headingEntries: { index: number; id: string }[] = []

  for (const entry of headingMap) {
    const fingerprint = getNodeFingerprint(
      entry.node,
      headingIndex++,
      '__heading__'
    )
    const id = getOrCreateId(fingerprint, cache)
    if (!entry.node.data) entry.node.data = {}
    ;(entry.node.data as Record<string, unknown>).automdId = id
    headingEntries.push({ index: entry.index, id })
  }

  // Second pass: annotate task list items
  // We need to track per-heading task indices for scoped fingerprinting
  const taskCountByScope = new Map<string, number>()

  // Walk through root children to determine scope, then visit lists within each
  for (let i = 0; i < ast.children.length; i++) {
    const rootChild = ast.children[i]
    const scope = findOwningHeadingId(i, headingEntries)

    visit(
      rootChild as Content,
      'listItem',
      (node: ListItem) => {
        if (node.checked === null || node.checked === undefined) return

        const count = taskCountByScope.get(scope) ?? 0
        taskCountByScope.set(scope, count + 1)

        const fingerprint = getNodeFingerprint(node, count, scope)
        const id = getOrCreateId(fingerprint, cache)
        if (!node.data) node.data = {}
        ;(node.data as Record<string, unknown>).automdId = id
      }
    )
  }

  return ast
}
