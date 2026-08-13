import { Prisma } from '@prisma/client'
import { fetchRSSFeed, ParsedArticle } from './rss-parser'
import { prisma } from './prisma'
import { findDuplicatesForBatch } from './dedupe'

export interface RSSSource {
  url: string
  source: string
}

const RSS_SOURCES: RSSSource[] = [
  { url: 'https://www.myjoyonline.com/feed/', source: 'MyJoyOnline' },
  { url: 'https://3news.com/feed.xml', source: '3News' },
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
  const fetchedArticles: ParsedArticle[] = []
  for (const source of RSS_SOURCES) {
    try {
      console.log(`Fetching RSS feed from ${source.source}...`)
      const articles = await fetchRSSFeed(source.url, source.source)
      fetchedArticles.push(...articles)
      console.log(`Completed fetching from ${source.source}: ${articles.length} articles found`)
    } catch (error) {
      console.error(`Error fetching from ${source.source}:`, error)
      failed++
    }
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

  // Step 3: one batched duplicate check covering every genuinely new
  // article from every source this cycle — see lib/dedupe.ts for why this
  // has to be a single call rather than one per article (free-tier rate
  // limit is 20 requests/minute; a dozen new articles at once would blow
  // through that instantly at one call each).
  const duplicateMatches = await findDuplicatesForBatch(
    newArticles.map((article) => ({ title: article.title, source: article.source }))
  )

  // Step 4: create each new article, merged into its match if one was found.
  for (let i = 0; i < newArticles.length; i++) {
    const article = newArticles[i]
    try {
      await createArticle(article, duplicateMatches.get(i) ?? null)
      success++
    } catch (error) {
      console.error(`Error storing article from ${article.source}:`, error)
      failed++
    }
  }

  console.log(`RSS fetch completed: ${success} new articles, ${failed} failed, ${deleted} deleted`)
  return { success, failed, deleted }
}

async function createArticle(article: ParsedArticle, mergedIntoId: string | null) {
  try {
    await prisma.article.create({
      data: {
        title: article.title,
        link: article.link,
        content: article.content,
        source: article.source,
        publishedAt: article.publishedAt,
        mergedIntoId: mergedIntoId ?? undefined,
      },
    })
  } catch (error) {
    // Lost a race with a concurrent fetch that inserted this exact link
    // first (e.g. the cron and a visitor-triggered refresh overlapping) —
    // fall back to an update. Same race-safety property the plain upsert
    // this replaced used to provide (see FIX_PLAN.md), just done by hand
    // since create-with-dedup-lookup can't be expressed as a single upsert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      await prisma.article.update({
        where: { link: article.link },
        data: {
          title: article.title,
          content: article.content,
          publishedAt: article.publishedAt,
        },
      })
      return
    }
    throw error
  }
}

// How long a fetch is considered "fresh enough" before a page load will
// trigger another one. Matches the external cron cadence (see
// .github/workflows/rss-fetch.yml) — this is a fallback for visits that
// land between scheduled runs, or for when the cron isn't wired up yet.
const STALE_MS = 15 * 60 * 1000

// Guards against a burst of concurrent requests (e.g. the homepage firing
// off /api/articles while a search is also in flight) each kicking off
// their own fetch. Only meaningful within a single warm server instance —
// on serverless that's fine, since fetchAndStoreArticles() handles
// concurrent inserts of the same link safely anyway, so an overlapping run
// from another instance is harmless.
let refreshInFlight: Promise<FetchResult> | null = null

export async function refreshIfStale(): Promise<void> {
  if (refreshInFlight) {
    await refreshInFlight
    return
  }

  const latest = await prisma.article.findFirst({
    orderBy: { publishedAt: 'desc' },
    select: { publishedAt: true },
  })

  const isStale =
    !latest?.publishedAt || Date.now() - latest.publishedAt.getTime() > STALE_MS

  if (!isStale) return

  refreshInFlight = fetchAndStoreArticles().finally(() => {
    refreshInFlight = null
  })
  await refreshInFlight
}
