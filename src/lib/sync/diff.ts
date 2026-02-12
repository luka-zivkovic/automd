/**
 * Computes the minimal change between two strings.
 * Returns a single change spec { from, to, insert } that can be applied
 * to a CodeMirror EditorView to preserve cursor position.
 */
export function computeMinimalChange(
  oldText: string,
  newText: string
): { from: number; to: number; insert: string } | null {
  if (oldText === newText) return null

  // Find common prefix
  let start = 0
  while (
    start < oldText.length &&
    start < newText.length &&
    oldText[start] === newText[start]
  ) {
    start++
  }

  // Find common suffix (not overlapping with prefix)
  let oldEnd = oldText.length
  let newEnd = newText.length
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--
    newEnd--
  }

  return {
    from: start,
    to: oldEnd,
    insert: newText.slice(start, newEnd),
  }
}
