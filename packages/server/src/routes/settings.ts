import { Router } from 'express'
import { readSettings, readRawSettings, writeSettings, maskSettings, isMaskedValue } from '../settings-storage.js'
import type { AppSettings } from '../settings-storage.js'
import { withWriteLock } from '../write-lock.js'

function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const hostname = parsed.hostname.toLowerCase()
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return false
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number)
      if (a === 10 || a === 127 || a === 0) return false
      if (a === 172 && b >= 16 && b <= 31) return false
      if (a === 192 && b === 168) return false
      if (a === 169 && b === 254) return false
    }
    if (hostname.startsWith('[') || hostname.includes(':')) return false
    return true
  } catch { return false }
}

export const settingsRouter = Router()

// Get settings (masked API keys)
settingsRouter.get('/', (_req, res, next) => {
  try {
    const raw = readRawSettings()
    const effective = readSettings()
    res.json({
      settings: maskSettings(raw),
      effective: maskSettings(effective),
      envOverrides: getEnvOverrides(),
    })
  } catch (err) {
    next(err)
  }
})

// Update settings (serialized via write lock to prevent read-modify-write races)
settingsRouter.put('/', async (req, res, next) => {
  try {
    const body = req.body as Partial<AppSettings>

    const current = await withWriteLock(() => {
      const settings = readRawSettings()

      // Merge: only update fields that are provided
      if (body.embeddings) {
        const emb = body.embeddings

        if (emb.provider !== undefined) {
          settings.embeddings.provider = emb.provider
        }

        if (emb.openai) {
          // Only update apiKey if it's not a masked/sentinel value
          if (emb.openai.apiKey !== undefined && emb.openai.apiKey !== '' && !isMaskedValue(emb.openai.apiKey)) {
            settings.embeddings.openai.apiKey = emb.openai.apiKey
          }
          if (emb.openai.baseUrl !== undefined) {
            if (emb.openai.baseUrl && !isValidExternalUrl(emb.openai.baseUrl)) {
              return { error: 'Invalid or blocked base URL' as const }
            }
            settings.embeddings.openai.baseUrl = emb.openai.baseUrl
          }
          if (emb.openai.model !== undefined) {
            settings.embeddings.openai.model = emb.openai.model
          }
        }

        if (emb.ollama) {
          if (emb.ollama.url !== undefined) {
            settings.embeddings.ollama.url = emb.ollama.url
          }
          if (emb.ollama.model !== undefined) {
            settings.embeddings.ollama.model = emb.ollama.model
          }
        }
      }

      writeSettings(settings)
      return settings
    })

    if (current && 'error' in current) {
      res.status(400).json({ error: current.error })
      return
    }

    // Notify embeddings system of config change (if initialized)
    const { reinitEmbeddings } = await import('../embeddings/index.js')
    const effective = readSettings()
    await reinitEmbeddings(effective)

    res.json({
      settings: maskSettings(current),
      effective: maskSettings(effective),
      envOverrides: getEnvOverrides(),
    })
  } catch (err) {
    next(err)
  }
})

// Test embedding provider connection
settingsRouter.post('/test-connection', async (req, res, next) => {
  try {
    const { provider, openai, ollama } = req.body as Partial<AppSettings['embeddings']>

    if (!provider) {
      res.status(400).json({ error: 'provider is required' })
      return
    }

    const { testProviderConnection } = await import('../embeddings/index.js')
    const result = await testProviderConnection({
      provider,
      openai: {
        apiKey: openai?.apiKey ?? '',
        baseUrl: openai?.baseUrl ?? 'https://api.openai.com/v1',
        model: openai?.model ?? 'text-embedding-3-small',
      },
      ollama: {
        url: ollama?.url ?? 'http://localhost:11434',
        model: ollama?.model ?? 'nomic-embed-text',
      },
    })

    if (result.ok) {
      res.json({ ok: true, dimensions: result.dimensions })
    } else {
      res.status(422).json({ ok: false, error: result.error })
    }
  } catch (err) {
    next(err)
  }
})

function getEnvOverrides(): Record<string, boolean> {
  return {
    provider: !!process.env.AUTOMD_EMBEDDING_PROVIDER,
    openaiApiKey: !!process.env.AUTOMD_OPENAI_API_KEY,
    openaiBaseUrl: !!process.env.AUTOMD_OPENAI_BASE_URL,
    openaiModel: !!process.env.AUTOMD_OPENAI_EMBEDDING_MODEL,
    ollamaUrl: !!process.env.AUTOMD_OLLAMA_URL,
    ollamaModel: !!process.env.AUTOMD_OLLAMA_EMBEDDING_MODEL,
  }
}
