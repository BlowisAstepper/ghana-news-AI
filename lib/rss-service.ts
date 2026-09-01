import { Prisma } from '@prisma/client'
import { fetchRSSFeed, ParsedArticle } from './rss-parser'
import { prisma } from './prisma'
import { findDuplicatesForBatch, resolveCanonicalTarget } from './dedupe'
import { NEWS_SOURCES } from './news-sources'

export interface FetchResult {
  success: number
  failed: number
  deleted: number
}

// How long an article sticks around before it's pruned. Deliberately short
// — this is a "what's happening now" feed, not an archive.
const RETENTION_HOURS = 48
const DB_WRITE_CONCURRENCY = 8

export async function fetchAndStoreArticles(): Promise<FetchResult> {
  let success = 0
  let failed = 0
  let deleted = 0
  let successfulSources = 0

  // Delete articles older than the retention window. Falls back to
  // createdAt for the rare article whose feed omitted a publish date — SQL's
  // `<` never matches NULL, so filtering on publishedAt alone let those rows
  // silently accumulate forever instead of ever being cleaned up.
  try {
    const cutoff = new Date()
    cutoff.setHours(cutoff.getHours() - RETENTION_HOURS)

    const deleteResult = await prisma.article.deleteMany({
      where: {
        OR: [
          { publishedAt: { lt: cutoff } },
          { publishedAt: null, createdAt: { lt: cutoff } },
        ],
      },
    })
    deleted = deleteResult.count
    console.log(`Deleted ${deleted} articles older than ${RETENTION_HOURS} hours`)
  } catch (error) {
    console.error('Error deleting old articles:', error)
  }

  // Step 1: pull every source's feed, tolerating individual source failures
  // (one outlet's feed being down shouldn't sink the whole fetch).
  const sourceResults = await Promise.all(
    NEWS_SOURCES.map(async (source): Promise<ParsedArticle[]> => {
      try {
        console.log(`Fetching RSS feed from ${source.source}...`)
        const articles = await fetchRSSFeed(
          source.url,
          source.source,
          source.allowedDomains
        )
        successfulSources++
        console.log(`Completed fetching from ${source.source}: ${articles.length} articles found`)
        return articles
      } catch (error) {
        console.error(`Error fetching from ${source.source}:`, error)
        failed++
        return []
      }
    })
  )
  const fetchedByLink = new Map<string, ParsedArticle>()
  for (const article of sourceResults.flat()) {
    if (!fetchedByLink.has(article.link)) fetchedByLink.set(article.link, article)
  }
  const fetchedArticles = [...fetchedByLink.values()]

  // Make the scheduler fail loudly when every upstream is unavailable. The
  // GitHub workflow treats the non-2xx response as an alert instead of
  // recording a misleadingly successful refresh.
  if (successfulSources === 0) {
    throw new Error('All configured RSS sources failed')
  }

  // Step 2: resolve known links in one database round trip rather than one
  // lookup per article. Existing rows are refreshed with bounded concurrency;
  // genuinely new rows continue to duplicate checking below.
  const existingRows = fetchedArticles.length
    ? await prisma.article.findMany({
        where: { link: { in: fetchedArticles.map((article) => article.link) } },
        select: { id: true, link: true },
      })
    : []
  const existingByLink = new Map(existingRows.map((article) => [article.link, article.id]))
  const newArticles: ParsedArticle[] = []
  const existingArticles: Array<{ id: string; article: ParsedArticle }> = []

  for (const article of fetchedArticles) {
    const existingId = existingByLink.get(article.link)
    if (existingId) {
      existingArticles.push({ id: existingId, article })
    } else {
      newArticles.push(article)
    }
  }

  await mapWithConcurrency(existingArticles, DB_WRITE_CONCURRENCY, async ({ id, article }) => {
    try {
        await prisma.article.update({
          where: { id },
          data: {
            title: article.title,
            content: article.content,
            publishedAt: article.publishedAt,
          },
        })
        success++
    } catch (error) {
      console.error(`Error updating article from ${article.source}:`, error)
      failed++
    }
  })

  // Step 3: batched duplicate checking covering every genuinely new article
  // from every source this cycle. Normal fetches fit in one Gemini call;
  // unusually large imports are chunked rather than silently leaving every
  // article after the prompt-size cap unchecked. Matches may point to an
  // existing canonical row or to an earlier article in this same fetch.
  const duplicateMatches = await findDuplicatesForBatch(
    newArticles.map((article) => ({ title: article.title, source: article.source }))
  )

  // Step 4: resolve every same-fetch chain to either an existing row or one
  // standalone root article. Roots can then be inserted concurrently, followed
  // by all duplicates concurrently, without N sequential database round trips.
  const targets = newArticles.map((_, index) =>
    resolveCanonicalTarget(index, duplicateMatches)
  )
  const rootIds = new Map<number, string>()
  const rootIndexes = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target, index }) => target.kind === 'batch-root' && target.articleIndex === index)
    .map(({ index }) => index)

  await mapWithConcurrency(rootIndexes, DB_WRITE_CONCURRENCY, async (index) => {
    const article = newArticles[index]
    try {
      const canonicalId = await createArticle(article, null)
      rootIds.set(index, canonicalId)
      success++
    } catch (error) {
      console.error(`Error storing canonical article from ${article.source}:`, error)
      failed++
    }
  })

  const duplicateIndexes = newArticles
    .map((_, index) => index)
    .filter((index) => !rootIndexes.includes(index))

  await mapWithConcurrency(duplicateIndexes, DB_WRITE_CONCURRENCY, async (index) => {
    const article = newArticles[index]
    const target = targets[index]
    const mergedIntoId =
      target.kind === 'existing'
        ? target.articleId
        : rootIds.get(target.articleIndex) ?? null

    try {
      await createArticle(article, mergedIntoId)
      success++
    } catch (error) {
      console.error(`Error storing duplicate article from ${article.source}:`, error)
      failed++
    }
  })

  console.log(`RSS fetch completed: ${success} articles processed, ${failed} failed, ${deleted} deleted`)
  return { success, failed, deleted }
}

async function createArticle(article: ParsedArticle, mergedIntoId: string | null): Promise<string> {
  try {
    const created = await prisma.article.create({
      data: {
        title: article.title,
        link: article.link,
        content: article.content,
        source: article.source,
        publishedAt: article.publishedAt,
        mergedIntoId: mergedIntoId ?? undefined,
      },
      select: { id: true, mergedIntoId: true },
    })
    return created.mergedIntoId ?? created.id
  } catch (error) {
    // Lost a race with a concurrent fetch that inserted this exact link
    // first (for example, two cron invocations overlapping) —
    // fall back to an update. Same race-safety property the plain upsert
    // this replaced used to provide (see FIX_PLAN.md), just done by hand
    // since create-with-dedup-lookup can't be expressed as a single upsert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.article.update({
        where: { link: article.link },
        data: {
          title: article.title,
          content: article.content,
          publishedAt: article.publishedAt,
        },
        select: { id: true, mergedIntoId: true },
      })
      return existing.mergedIntoId ?? existing.id
    }

    // A concurrent retention run can remove an existing canonical candidate
    // between duplicate detection and insert. In that case, retain the news
    // article as a standalone story instead of failing ingestion because its
    // now-stale foreign key disappeared.
    if (
      mergedIntoId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      console.warn(`Duplicate target ${mergedIntoId} disappeared; storing ${article.link} standalone`)
      return createArticle(article, null)
    }
    throw error
  }
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        await mapper(items[index])
      }
    })
  )
}
