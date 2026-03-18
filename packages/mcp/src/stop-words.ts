/**
 * Shared stop words for text search and similarity.
 * Canonical source: packages/shared/src/text-search.ts — keep in sync.
 */
export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'for', 'and', 'but', 'or',
  'not', 'no', 'in', 'on', 'at', 'to', 'from', 'by', 'with', 'of',
  'it', 'its', 'this', 'that', 'these', 'those', 'we', 'our', 'use',
  'using', 'used', 'if', 'then', 'so', 'as', 'up', 'out', 'about',
  'into', 'over', 'after', 'before', 'between', 'under', 'above',
])
