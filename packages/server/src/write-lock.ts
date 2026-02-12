/**
 * Global write queue for serializing all mutation operations.
 * Since all writes touch manifest.json, a single global lock
 * prevents concurrent read-modify-write races.
 */
let writeQueue: Promise<void> = Promise.resolve()

export function withWriteLock<T>(fn: () => T): Promise<T> {
  const result = writeQueue.then(() => fn())

  // Chain continues regardless of success/failure
  writeQueue = result.then(
    () => {},
    () => {},
  )

  return result
}
