import { createInteraction } from './gemini'

// Bounds the prompt regardless of how long the source article is — keeps
// requests fast and keeps us comfortably inside the free-tier's per-request
// limits even on the rare very-long article.
const MAX_CONTENT_CHARS = 6000

export async function summarizeArticle(title: string, content: string): Promise<string> {
  const truncated =
    content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) + '...' : content

  const prompt =
    "You rewrite Ghanaian news articles in plain, easy-to-read language for a general audience. " +
    "Paraphrase in your own words — don't copy sentences from the source. Keep it to 3-4 short sentences. " +
    "Focus only on the main story: the core facts (who, what, when, where, why). Extracted article text " +
    "sometimes has unrelated material mixed in — other headlines, related-article teasers, bylines, social " +
    "links, promotional text. Ignore all of that; summarize only the primary news story itself. " +
    "Don't add facts that aren't in the article, don't editorialize, and don't include a title, heading, " +
    "or preamble — output only the summary text.\n\n" +
    `Title: ${title}\n\nArticle:\n${truncated}`

  return createInteraction(prompt)
}
