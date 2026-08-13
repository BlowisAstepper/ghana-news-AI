import { prisma } from './prisma'
import { createInteraction } from './gemini'

export interface NewArticleForDedupe {
  title: string
  source: string
}

// How many existing canonical stories get offered as match candidates, and
// how many brand-new articles get checked in one go. Both are defensive
// caps on prompt size, not expected to bind in normal operation — a fetch
// cycle after the first one typically only has a handful of genuinely new
// articles per source.
const MAX_CANDIDATE_POOL = 150
const MAX_NEW_PER_BATCH = 60

/**
 * Looks for existing, still-canonical articles from a different source that
 * cover the same real-world story as each of the given new articles — so
 * ingestion can merge them into one entry instead of showing near-duplicate
 * stories from different outlets side by side.
 *
 * Deliberately batched into a single Gemini call for the whole fetch cycle
 * rather than one call per new article: the free tier caps at 20
 * requests/minute, and a fetch pulling in a dozen-plus new articles across
 * multiple sources would blow through that in seconds if each one made its
 * own call. One call, regardless of how many new articles there are, is
 * what keeps this workable on the free tier.
 *
 * Returns a map from the new article's index in `newArticles` to the id of
 * the canonical article it matches. Missing entries mean "no match" —
 * including on any parsing/API failure, since a missed merge just means two
 * cards instead of one, a far safer failure mode than guessing wrong.
 */
export async function findDuplicatesForBatch(
  newArticles: NewArticleForDedupe[]
): Promise<Map<number, string>> {
  const matches = new Map<number, string>()
  if (newArticles.length === 0) return matches

  const batch = newArticles.slice(0, MAX_NEW_PER_BATCH)

  const candidates = await prisma.article.findMany({
    where: { mergedIntoId: null },
    select: { id: true, title: true, source: true },
    orderBy: { publishedAt: 'desc' },
    take: MAX_CANDIDATE_POOL,
  })

  if (candidates.length === 0) return matches

  const existingList = candidates
    .map((c, i) => `E${i + 1}. [${c.source}] ${c.title}`)
    .join('\n')
  const newList = batch.map((a, i) => `N${i + 1}. [${a.source}] ${a.title}`).join('\n')

  const prompt =
    'Below are EXISTING news stories already being tracked, and NEW headlines just fetched. For each ' +
    'NEW headline, determine whether it reports the same real-world event as one of the EXISTING ' +
    'stories — different outlets often phrase the same story very differently, so judge by the actual ' +
    'event, not exact wording.\n\n' +
    `EXISTING stories:\n${existingList}\n\n` +
    `NEW headlines:\n${newList}\n\n` +
    'Respond with exactly one line per NEW headline, formatted as "<N-label>: <matching E-label or ' +
    'none>" — for example "N1: E12" or "N2: none". No other text.'

  try {
    const responseText = await createInteraction(prompt)
    const lines = responseText.split('\n').map((line) => line.trim()).filter(Boolean)

    for (const line of lines) {
      const parsed = line.match(/^N(\d+)\s*:\s*(E(\d+)|none)$/i)
      if (!parsed) continue

      const newIndex = parseInt(parsed[1], 10) - 1
      if (newIndex < 0 || newIndex >= batch.length) continue
      if (parsed[2].toLowerCase() === 'none') continue

      const candidateIndex = parseInt(parsed[3], 10) - 1
      if (candidateIndex < 0 || candidateIndex >= candidates.length) continue

      matches.set(newIndex, candidates[candidateIndex].id)
    }
  } catch (error) {
    console.error('Batch duplicate-check failed, treating all as no match:', error)
  }

  return matches
}
