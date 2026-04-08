import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

let _version: string | null = null

export function getAppVersion(): string {
  if (process.env.AUTOMD_VERSION) return process.env.AUTOMD_VERSION
  if (_version) return _version
  try {
    const pkgPath = path.resolve(fileURLToPath(import.meta.url), '../../package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    _version = pkg.version ?? '0.0.0'
  } catch {
    _version = '0.0.0'
  }
  return _version!
}
