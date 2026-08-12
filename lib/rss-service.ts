import { fetchRSSFeed, ParsedArticle } from './rss-parser'
import { prisma } from './prisma'

export interface RSSSource {
  url: string
  source: string
}

const RSS_SOURCES: RSSSource[] = [
  { url: "https://www.myjoyonline.com/feed/", source: "MyJoyOnline" },
]

export interface FetchResult {
  success: number
  failed: number
  deleted: number
}

export async function fetchAndStoreArticles(): Promise<FetchResult> {
  let success = 0
  let failed = 0
  let deleted = 0

  // Delete articles older than 24 hours based on publishedAt
  try {
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    const deleteResult = await prisma.article.deleteMany({
      where: {
        publishedAt: {
          lt: twentyFourHoursAgo,
        },
      },
    })
    deleted = deleteResult.count
    console.log(`Deleted ${deleted} articles older than 24 hours`)
  } catch (error) {
    console.error('Error deleting old articles:', error)
  }

  for (const source of RSS_SOURCES) {
    try {
      console.log(`Fetching RSS feed from ${source.source}...`)
      const articles = await fetchRSSFeed(source.url, source.source)

      for (const article of articles) {
        try {
          // Use upsert to handle race conditions - atomically creates or updates
          await prisma.article.upsert({
            where: { link: article.link },
            update: {
              title: article.title,
              content: article.content,
              publishedAt: article.publishedAt,
            },
            create: {
              title: article.title,
              link: article.link,
              content: article.content,
              source: article.source,
              publishedAt: article.publishedAt,
            },
          })
          success++
        } catch (error) {
          console.error(`Error storing article from ${source.source}:`, error)
          failed++
        }
      }

      console.log(`Completed fetching from ${source.source}: ${articles.length} articles found`)
    } catch (error) {
      console.error(`Error fetching from ${source.source}:`, error)
      failed++
    }
  }

  console.log(`RSS fetch completed: ${success} new articles, ${failed} failed, ${deleted} deleted`)
  return { success, failed, deleted }
}

// How long a fetch is considered "fresh enough" before a page load will
// trigger another one. Matches the external cron cadence (see
// .github/workflows/rss-fetch.yml) — this is a fallback for visits that
// land between scheduled runs, or for when the cron isn't wired up yet.
const STALE_MS = 15 * 60 * 1000

// Guards against a burst of concurrent requests (e.g. the homepage firing
// off /api/articles while a search is also in flight) each kicking off
// their own fetch. Only meaningful within a single warm server instance —
// on serverless that's fine, since fetchAndStoreArticles() upserts by link
// anyway, so an overlapping run from another instance is harmless.
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
