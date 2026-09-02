import { GoogleGenAI } from '@google/genai'

// Free-tier Gemini client (Google AI Studio) — used for article summaries
// and cross-source duplicate-story matching.
// GEMINI_API_KEY comes from https://aistudio.google.com/apikey, no billing
// required for the free tier.
let gemini: GoogleGenAI | undefined

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured')
  gemini ??= new GoogleGenAI({ apiKey })
  return gemini
}

// Flash-Lite is the stable high-throughput model and is a better fit for short
// summaries and headline matching. Rate limits are model-specific, so the
// regular Flash model provides a bounded fallback during a Lite quota spike.
// Both models support minimal thinking for these simple tasks.
// The older `models.generateContent` call is legacy; Google recommends the
// Interactions API for new integrations. See:
// https://ai.google.dev/gemini-api/docs/migrate-to-interactions
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'
export const GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash'

interface InteractionOptions {
  timeoutMs?: number
}

export function isGeminiRateLimitError(error: unknown): boolean {
  const details = error as { status?: unknown; statusCode?: unknown }
  return details?.status === 429 || details?.statusCode === 429
}

async function runInteraction(
  model: string,
  input: string,
  timeoutMs: number
): Promise<string> {
  const interaction = await getGeminiClient().interactions.create(
    {
      model,
      input,
      generation_config: {
        thinking_level: 'minimal',
        max_output_tokens: 256,
      },
      // Summaries and duplicate checks are independent, single-turn tasks;
      // retaining server-side interaction history provides no product value.
      store: false,
    },
    { timeout: timeoutMs, maxRetries: 0 }
  )

  return (interaction.output_text ?? '').trim()
}

export async function createInteraction(
  input: string,
  options: InteractionOptions = {}
): Promise<string> {
  // Leave enough headroom inside the route's 60-second budget for optional
  // publisher extraction, database claims, caching, and cleanup. A fallback
  // shares the original deadline instead of receiving a fresh timeout.
  const timeoutMs = options.timeoutMs ?? 42_000
  const startedAt = Date.now()

  try {
    return await runInteraction(GEMINI_MODEL, input, timeoutMs)
  } catch (error) {
    if (!isGeminiRateLimitError(error)) throw error

    const remainingMs = timeoutMs - (Date.now() - startedAt)
    if (remainingMs < 1_000) throw error

    console.warn(
      `${GEMINI_MODEL} is rate-limited; retrying with ${GEMINI_FALLBACK_MODEL}`
    )
    return runInteraction(GEMINI_FALLBACK_MODEL, input, remainingMs)
  }
}
