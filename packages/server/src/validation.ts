import path from 'node:path'

// IDs should be nanoid format: alphanumeric + _ + -
const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,50}$/

export function isValidId(id: string): boolean {
  return typeof id === 'string' && SAFE_ID_PATTERN.test(id)
}

export function isValidName(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 200
}

/** Verify that a resolved path is within the expected directory */
export function isWithinDirectory(filePath: string, directory: string): boolean {
  const resolved = path.resolve(filePath)
  const resolvedDir = path.resolve(directory)
  return resolved.startsWith(resolvedDir + path.sep) || resolved === resolvedDir
}
