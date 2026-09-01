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

// Use the stable Flash model for short summaries and headline matching. It is
// consistently available to the production API key; minimal thinking keeps
// these simple tasks within the serverless request budget.
// The older `models.generateContent` call is legacy; Google recommends the
// Interactions API for new integrations. See:
// https://ai.google.dev/gemini-api/docs/migrate-to-interactions
export const GEMINI_MODEL = 'gemini-3.6-flash'

interface InteractionOptions {
  timeoutMs?: number
}

export async function createInteraction(
  input: string,
  options: InteractionOptions = {}
): Promise<string> {
  const interaction = await getGeminiClient().interactions.create(
    {
      model: GEMINI_MODEL,
      input,
      generation_config: {
        thinking_level: 'minimal',
        max_output_tokens: 256,
      },
      // Summaries and duplicate checks are independent, single-turn tasks;
      // retaining server-side interaction history provides no product value.
      store: false,
    },
    // Leave enough headroom inside the route's 60-second budget for optional
    // publisher extraction, database claims, caching, and cleanup.
    { timeout: options.timeoutMs ?? 42_000, maxRetries: 0 }
  )

  return (interaction.output_text ?? '').trim()
}
