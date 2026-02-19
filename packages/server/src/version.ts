const FALLBACK_VERSION = '0.1.0'

export function getAppVersion(): string {
  return process.env.AUTOMD_VERSION || FALLBACK_VERSION
}
