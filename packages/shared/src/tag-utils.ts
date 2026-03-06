/**
 * Normalize a tag string for consistent storage and comparison.
 * - Trims whitespace
 * - Lowercases
 * - Replaces spaces with hyphens (tags should use hyphens, e.g. 'my-tag' not 'my tag')
 * - Strips empty results
 */
export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-')
}
