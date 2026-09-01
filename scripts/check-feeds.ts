import { NEWS_SOURCES } from '../lib/news-sources'
import { fetchRSSFeed } from '../lib/rss-parser'

const startedAt = Date.now()
const results = await Promise.allSettled(
  NEWS_SOURCES.map((source) =>
    fetchRSSFeed(source.url, source.source, source.allowedDomains)
  )
)

const report = results.map((result, index) => ({
  source: NEWS_SOURCES[index].source,
  ...(result.status === 'fulfilled'
    ? { status: 'ok', articles: result.value.length }
    : { status: 'error', error: String(result.reason) }),
}))

console.log(JSON.stringify({ elapsedMs: Date.now() - startedAt, sources: report }, null, 2))
if (results.some((result) => result.status === 'rejected')) process.exitCode = 1
