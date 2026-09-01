import { Prisma } from '@prisma/client'
import { fetchRSSFeed, ParsedArticle } from './rss-parser'
import { prisma } from './prisma'
import { findDuplicatesForBatch } from './dedupe'

export interface RSSSource {
  url: string
  source: string
  allowedDomains: readonly string[]
}

const RSS_SOURCES: RSSSource[] = [
  {
    url: 'https://www.myjoyonline.com/feed/',
    source: 'MyJoyOnline',
    allowedDomains: ['myjoyonline.com'],
  },
  {
    url: 'https://3news.com/feed.xml',
    source: '3News',
    allowedDomains: ['3news.com'],
  },
  // Graphic (graphic.com.gh) intentionally left out. Their RSS endpoint is
  // reachable but returns a validly-formed, completely empty channel (no
  // <item>s) — confirmed by hand, not assumed. Same failure mode that got
  // it dropped from this project before (see FIX_PLAN.md history).
]

export interface FetchResult {
  success: number
  failed: number
  deleted: number
}

// How long an article sticks around before it's pruned. Deliberately short
// — this is a "what's happening now" feed, not an archive.
const RETENTION_HOURS = 48

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
    RSS_SOURCES.map(async (source): Promise<ParsedArticle[]> => {
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
  const fetchedArticles = sourceResults.flat()

  // Make the scheduler fail loudly when every upstream is unavailable. The
  // GitHub workflow treats the non-2xx response as an alert instead of
  // recording a misleadingly successful refresh.
  if (successfulSources === 0) {
    throw new Error('All configured RSS sources failed')
  }

  // Step 2: split into "already known" (just refresh in place) vs
  // "genuinely new" (needs a duplicate check before it's created).
  const newArticles: ParsedArticle[] = []

  for (const article of fetchedArticles) {
    try {
      const existing = await prisma.article.findUnique({
        where: { link: article.link },
        select: { id: true },
      })

      if (existing) {
        await prisma.article.update({
          where: { id: existing.id },
          data: {
            title: article.title,
            content: article.content,
            publishedAt: article.publishedAt,
          },
        })
        success++
      } else {
        newArticles.push(article)
      }
    } catch (error) {
      console.error(`Error checking/updating article from ${article.source}:`, error)
      failed++
    }
  }

  // Step 3: batched duplicate checking covering every genuinely new article
  // from every source this cycle. Normal fetches fit in one Gemini call;
  // unusually large imports are chunked rather than silently leaving every
  // article after the prompt-size cap unchecked. Matches may point to an
  // existing canonical row or to an earlier article in this same fetch.
  const duplicateMatches = await findDuplicatesForBatch(
    newArticles.map((article) => ({ title: article.title, source: article.source }))
  )

  // Step 4: create each new article in order. Keeping the canonical id for
  // every successful insert lets a same-fetch N -> N match resolve to a real
  // database id, including chains such as N3 -> N2 -> N1.
  const canonicalIds = new Map<number, string>()
  for (let i = 0; i < newArticles.length; i++) {
    const article = newArticles[i]
    try {
      const duplicateMatch = duplicateMatches.get(i)
      let mergedIntoId: string | null = null

      if (duplicateMatch?.kind === 'existing') {
        mergedIntoId = duplicateMatch.articleId
      } else if (duplicateMatch?.kind === 'batch') {
        // If storing the earlier article failed, keeping this one canonical
        // is safer than pointing at a missing row or dropping it as well.
        mergedIntoId = canonicalIds.get(duplicateMatch.articleIndex) ?? null
      }

      const canonicalId = await createArticle(article, mergedIntoId)
      canonicalIds.set(i, canonicalId)
      success++
    } catch (error) {
      console.error(`Error storing article from ${article.source}:`, error)
      failed++
    }
  }

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
