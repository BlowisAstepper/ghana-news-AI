import Parser from 'rss-parser'
import * as cheerio from 'cheerio'
import { fetchPublisherText, validatePublisherUrl } from './publisher-fetch'

const FEED_TIMEOUT_MS = 6_000
const MAX_FEED_BYTES = 2 * 1024 * 1024

// Scheduled ingestion must fit inside a short serverless invocation. Twenty
// items per source is more than enough for a 15-minute poll while bounding the
// initial import and database work. Full article extraction happens lazily when
// a reader requests a summary, not for every feed item.
export const MAX_ITEMS_PER_SOURCE = 20

function createParser() {
  return new Parser({
    customFields: {
      item: [
        ['media:content', 'media:content'],
        ['media:thumbnail', 'media:thumbnail'],
        ['content:encoded', 'content:encoded'],
      ],
    },
  })
}

export interface ParsedArticle {
  title: string
  link: string
  content: string
  source: string
  publishedAt?: Date
}

export async function fetchRSSFeed(
  url: string,
  source: string,
  allowedDomains: readonly string[]
): Promise<ParsedArticle[]> {
  const feedUrl = validatePublisherUrl(url, allowedDomains)
  const xml = await fetchPublisherText(feedUrl, {
    allowedDomains,
    timeoutMs: FEED_TIMEOUT_MS,
    maxBytes: MAX_FEED_BYTES,
    accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
  })
  const feed = await createParser().parseString(xml)
  const articles: ParsedArticle[] = []

  for (const item of (feed.items || []).slice(0, MAX_ITEMS_PER_SOURCE)) {
    try {
      if (!item.title || !item.link) continue

      const articleUrl = validatePublisherUrl(item.link, allowedDomains, feedUrl)
      const content = item.content || item['content:encoded'] || item.summary || ''
      const $ = cheerio.load(content)
      $('script, style, iframe, nav, header, footer, aside').remove()
      const cleanContent = $.text().replace(/\s+/g, ' ').trim()

      if (!cleanContent) continue

      articles.push({
        title: item.title.replace(/\s+/g, ' ').trim(),
        link: articleUrl,
        content: cleanContent,
        source,
        publishedAt: parsePublishedDate(item.pubDate),
      })
    } catch (error) {
      // A malformed item does not make the whole publisher unavailable.
      console.error(`Error processing article from ${source}:`, error)
    }
  }

  return articles
}

export function parsePublishedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}
