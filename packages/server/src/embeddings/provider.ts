/**
 * Embedding provider interface and factory.
 *
 * Providers generate vector embeddings from text using external services.
 * The factory reads from AppSettings to instantiate the configured provider.
 */

import type { EmbeddingsSettings } from '../settings-storage.js'
import { createOpenAIProvider } from './openai-provider.js'
import { createOllamaProvider } from './ollama-provider.js'

export interface EmbeddingProvider {
  /** Unique identifier (e.g. 'openai', 'ollama') */
  readonly name: string

  /** Dimensionality of the vectors produced */
  readonly dimensions: number

  /** Generate embedding vectors for one or more text chunks */
  embed(texts: string[]): Promise<Float32Array[]>
}

/** Create a provider from settings. Returns null if not configured. */
export function createProvider(settings: EmbeddingsSettings): EmbeddingProvider | null {
  if (!settings.provider) return null

  switch (settings.provider) {
    case 'openai':
      if (!settings.openai.apiKey) {
        console.warn('[embeddings] OpenAI provider selected but no API key configured')
        return null
      }
      return createOpenAIProvider(settings.openai)
    case 'ollama':
      return createOllamaProvider(settings.ollama)
    default:
      console.warn(`[embeddings] Unknown provider: ${settings.provider}`)
      return null
  }
}
