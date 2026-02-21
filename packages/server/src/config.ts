import path from 'node:path'
import os from 'node:os'

/** Base storage directory — lazy-evaluated to support AUTOMD_STORAGE_DIR override (used in tests) */
export function getAutomdDir() {
  return process.env.AUTOMD_STORAGE_DIR ?? path.join(os.homedir(), '.automd')
}
