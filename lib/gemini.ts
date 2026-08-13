import { GoogleGenAI } from '@google/genai'

// Free-tier Gemini client (Google AI Studio) — used for article summaries
// and cross-source duplicate-story matching.
// GEMINI_API_KEY comes from https://aistudio.google.com/apikey, no billing
// required for the free tier.
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

// gemini-2.5-flash and the older `models.generateContent` call are retired
// for new API keys — Google moved to the Interactions API. See:
// https://ai.google.dev/gemini-api/docs/migrate-to-interactions
export const GEMINI_MODEL = 'gemini-3.6-flash'

// The free tier is limited to 20 requests/minute for this model — Google's
// own 429 body states the number explicitly. A 429 here is routine (not a
// bug) any time a burst of calls lands close together, so every caller
// should go through this instead of calling gemini.interactions.create()
// directly: one retry after a short wait clears the vast majority of them.
export async function createInteraction(input: string): Promise<string> {
  const attempt = async () => {
    const interaction = await gemini.interactions.create({ model: GEMINI_MODEL, input })
    return (interaction.output_text ?? '').trim()
  }

  try {
    return await attempt()
  } catch (error) {
    const status = (error as { status?: number })?.status
    if (status !== 429) throw error

    console.warn('Gemini rate-limited, retrying once after a short wait...')
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return attempt()
  }
}
