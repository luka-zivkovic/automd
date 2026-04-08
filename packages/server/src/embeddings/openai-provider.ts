/**
 * OpenAI embedding provider — uses text-embedding-3-small by default.
 * Plain fetch, no SDK dependency.
 */

import type { EmbeddingProvider } from './provider.js'

interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

// Known dimensions for common models
const MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
}

const MAX_BATCH_SIZE = 2048

export function createOpenAIProvider(config: OpenAIConfig): EmbeddingProvider {
  const dimensions = MODEL_DIMENSIONS[config.model] ?? 1536

  return {
    name: 'openai',
    dimensions,

    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return []

      const results: Float32Array[] = []

      // Batch into chunks of MAX_BATCH_SIZE
      for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE)
        const batchResults = await embedBatch(config, batch)
        results.push(...batchResults)
      }

      return results
    },
  }
}

async function embedBatch(config: OpenAIConfig, texts: string[]): Promise<Float32Array[]> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/embeddings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAI embeddings API error (${response.status}): ${body}`)
  }

  const json = await response.json() as {
    data: Array<{ embedding: number[]; index: number }>
  }

  // Sort by index to maintain order
  const sorted = json.data.sort((a, b) => a.index - b.index)
  return sorted.map((d) => new Float32Array(d.embedding))
}
