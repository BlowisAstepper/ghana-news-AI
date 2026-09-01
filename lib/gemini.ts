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

// Use the stable Flash-Lite model for short summaries and headline matching:
// these are small, latency-sensitive tasks that do not need a heavier model.
// The older `models.generateContent` call is legacy; Google recommends the
// Interactions API for new integrations. See:
// https://ai.google.dev/gemini-api/docs/migrate-to-interactions
export const GEMINI_MODEL = 'gemini-3.5-flash-lite'

export async function createInteraction(input: string): Promise<string> {
  const interaction = await getGeminiClient().interactions.create(
    {
      model: GEMINI_MODEL,
      input,
      generation_config: { thinking_level: 'minimal' },
      // Summaries and duplicate checks are independent, single-turn tasks;
      // retaining server-side interaction history provides no product value.
      store: false,
    },
    { timeout: 12_000, maxRetries: 0 }
  )

  return (interaction.output_text ?? '').trim()
}
