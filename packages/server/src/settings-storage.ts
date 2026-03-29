/**
 * Settings Storage — server-side configuration persisted to ~/.automd/settings.json.
 *
 * Env vars override file settings (for Docker/CI). File settings override defaults.
 * Priority: env var > settings.json > defaults.
 */

import fs from 'node:fs'
import path from 'node:path'
import { getAutomdDir } from './config.js'

// ─── Types ──────────────────────────────────────────────────────────────

export interface EmbeddingsSettings {
  provider: 'openai' | 'ollama' | null
  openai: {
    apiKey: string
    baseUrl: string
    model: string
  }
  ollama: {
    url: string
    model: string
  }
}

export interface AppSettings {
  embeddings: EmbeddingsSettings
}

// ─── Defaults ───────────────────────────────────────────────────────────

const DEFAULTS: AppSettings = {
  embeddings: {
    provider: null,
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
    },
    ollama: {
      url: 'http://localhost:11434',
      model: 'nomic-embed-text',
    },
  },
}

// ─── File I/O ───────────────────────────────────────────────────────────

function getSettingsPath(): string {
  return path.join(getAutomdDir(), 'settings.json')
}

function ensureDir() {
  const dir = getAutomdDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readSettingsFile(): Partial<AppSettings> {
  ensureDir()
  const settingsPath = getSettingsPath()
  if (!fs.existsSync(settingsPath)) return {}
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    console.error('[settings] Failed to read settings.json:', err)
    return {}
  }
}

function writeSettingsFile(data: AppSettings) {
  ensureDir()
  const settingsPath = getSettingsPath()
  const tmpPath = settingsPath + '.tmp'
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, settingsPath)
  } catch (err) {
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    throw new Error(`Failed to write settings.json: ${err}`)
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/** Read settings with env var overrides applied */
export function readSettings(): AppSettings {
  const file = readSettingsFile()
  const fileEmb = (file.embeddings ?? {}) as Partial<EmbeddingsSettings>
  const fileOpenai = fileEmb.openai ?? DEFAULTS.embeddings.openai
  const fileOllama = fileEmb.ollama ?? DEFAULTS.embeddings.ollama

  return {
    embeddings: {
      provider: envProvider() ?? fileEmb.provider ?? DEFAULTS.embeddings.provider,
      openai: {
        apiKey: process.env.AUTOMD_OPENAI_API_KEY ?? fileOpenai.apiKey ?? DEFAULTS.embeddings.openai.apiKey,
        baseUrl: process.env.AUTOMD_OPENAI_BASE_URL ?? fileOpenai.baseUrl ?? DEFAULTS.embeddings.openai.baseUrl,
        model: process.env.AUTOMD_OPENAI_EMBEDDING_MODEL ?? fileOpenai.model ?? DEFAULTS.embeddings.openai.model,
      },
      ollama: {
        url: process.env.AUTOMD_OLLAMA_URL ?? fileOllama.url ?? DEFAULTS.embeddings.ollama.url,
        model: process.env.AUTOMD_OLLAMA_EMBEDDING_MODEL ?? fileOllama.model ?? DEFAULTS.embeddings.ollama.model,
      },
    },
  }
}

/** Read raw file settings (without env overrides) — for the settings API */
export function readRawSettings(): AppSettings {
  const file = readSettingsFile()
  const fileEmb = (file.embeddings ?? {}) as Partial<EmbeddingsSettings>
  const fileOpenai = fileEmb.openai ?? DEFAULTS.embeddings.openai
  const fileOllama = fileEmb.ollama ?? DEFAULTS.embeddings.ollama

  return {
    embeddings: {
      provider: fileEmb.provider ?? DEFAULTS.embeddings.provider,
      openai: {
        apiKey: fileOpenai.apiKey ?? DEFAULTS.embeddings.openai.apiKey,
        baseUrl: fileOpenai.baseUrl ?? DEFAULTS.embeddings.openai.baseUrl,
        model: fileOpenai.model ?? DEFAULTS.embeddings.openai.model,
      },
      ollama: {
        url: fileOllama.url ?? DEFAULTS.embeddings.ollama.url,
        model: fileOllama.model ?? DEFAULTS.embeddings.ollama.model,
      },
    },
  }
}

/** Write settings to file */
export function writeSettings(settings: AppSettings): void {
  writeSettingsFile(settings)
}

/** Mask sensitive fields for API responses */
export function maskSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    embeddings: {
      ...settings.embeddings,
      openai: {
        ...settings.embeddings.openai,
        apiKey: maskApiKey(settings.embeddings.openai.apiKey),
      },
    },
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function envProvider(): 'openai' | 'ollama' | null {
  const val = process.env.AUTOMD_EMBEDDING_PROVIDER
  if (val === 'openai' || val === 'ollama') return val
  return null
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return key ? '****' : ''
  return key.slice(0, 7) + '****'
}
