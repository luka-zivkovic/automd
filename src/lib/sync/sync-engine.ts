/**
 * Creates a debounced re-parse function.
 * When the editor changes rapidly (user typing), we debounce the
 * markdown -> AST -> tasks re-parse to avoid thrashing.
 */
export function createDebouncedReparse(
  callback: (markdown: string) => void,
  delay: number = 300
): {
  trigger: (markdown: string) => void
  flush: () => void
  cancel: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingMarkdown: string | null = null

  function trigger(markdown: string) {
    pendingMarkdown = markdown
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (pendingMarkdown !== null) {
        callback(pendingMarkdown)
        pendingMarkdown = null
      }
      timer = null
    }, delay)
  }

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pendingMarkdown !== null) {
      callback(pendingMarkdown)
      pendingMarkdown = null
    }
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    pendingMarkdown = null
  }

  return { trigger, flush, cancel }
}
