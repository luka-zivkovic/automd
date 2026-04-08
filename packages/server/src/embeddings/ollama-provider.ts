/**
 * Ollama embedding provider — uses nomic-embed-text by default.
 * Calls local Ollama server, no API key needed.
 */

import type { EmbeddingProvider } from './provider.js'

interface OllamaConfig {
  url: string
  model: string
}

// Known dimensions for common Ollama models
const MODEL_DIMENSIONS: Record<string, number> = {
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'snowflake-arctic-embed': 1024,
}

export function createOllamaProvider(config: OllamaConfig): EmbeddingProvider {
  const dimensions = MODEL_DIMENSIONS[config.model] ?? 768

  return {
    name: 'ollama',
    dimensions,

    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return []

      const url = `${config.url.replace(/\/+$/, '')}/api/embed`

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          input: texts,
        }),
        signal: AbortSignal.timeout(60_000), // Ollama may be slower (local inference)
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Ollama embeddings API error (${response.status}): ${body}`)
      }

      const json = await response.json() as {
        embeddings: number[][]
      }

      return json.embeddings.map((e) => new Float32Array(e))
    },
  }
}
