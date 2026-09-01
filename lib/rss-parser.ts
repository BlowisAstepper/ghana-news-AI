import Parser from 'rss-parser'
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

function createParser() {
  // rss-parser keeps mutable XML parsing state, so each concurrently fetched
  // source gets its own instance.
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

const FEED_TIMEOUT_MS = 10_000
const ARTICLE_TIMEOUT_MS = 5_000
const MAX_FEED_BYTES = 2 * 1024 * 1024
const MAX_ARTICLE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const ARTICLE_FETCH_CONCURRENCY = 4

interface SecureFetchOptions {
  allowedDomains: readonly string[]
  timeoutMs: number
  maxBytes: number
  accept: string
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
  const xml = await fetchText(feedUrl, {
    allowedDomains,
    timeoutMs: FEED_TIMEOUT_MS,
    maxBytes: MAX_FEED_BYTES,
    accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
  })
  const feed = await createParser().parseString(xml)

  // Full-page extraction is only needed for unusually thin RSS entries. A
  // small worker pool avoids waiting for those pages one-by-one without
  // opening an unbounded number of connections to a publisher.
  const parsedArticles = await mapWithConcurrency(
    feed.items || [],
    ARTICLE_FETCH_CONCURRENCY,
    async (item): Promise<ParsedArticle | null> => {
      try {
        if (!item.title || !item.link) return null

        // Feed contents are external input too. Only retain ordinary web
        // links belonging to the publisher whose feed we deliberately
        // requested; this prevents unsafe schemes and cross-host SSRF when
        // fetching a full article below.
        const articleUrl = validatePublisherUrl(item.link, allowedDomains, feedUrl)
        let content = item.content || item['content:encoded'] || item.summary || ''

        // If content is minimal, try to fetch full article
        if (content.length < 200) {
          try {
            const fullContent = await fetchFullArticle(articleUrl, allowedDomains)
            // Preserve a useful RSS excerpt when full-page extraction times
            // out or the publisher page cannot be parsed.
            if (fullContent.trim()) content = fullContent
          } catch (error) {
            console.warn(`Failed to fetch full article for ${articleUrl}:`, error)
          }
        }

        // Clean up HTML content
        const $ = cheerio.load(content)
        $('script, style, iframe, nav, header, footer, aside').remove()
        const cleanContent = $.text().trim()

        if (!cleanContent) return null

        return {
          title: item.title.trim(),
          link: articleUrl,
          content: cleanContent,
          source,
          publishedAt: parsePublishedDate(item.pubDate),
        }
      } catch (error) {
        console.error(`Error processing article from ${source}:`, error)
        return null
      }
    }
  )

  // Feed-level failures intentionally propagate to rss-service so its
  // per-source failure counter is truthful. Only bad individual items above
  // are converted to null and skipped.
  return parsedArticles.filter(
    (article): article is ParsedArticle => article !== null
  )
}

async function fetchFullArticle(
  url: string,
  allowedDomains: readonly string[]
): Promise<string> {
  try {
    const html = await fetchText(url, {
      allowedDomains,
      timeoutMs: ARTICLE_TIMEOUT_MS,
      maxBytes: MAX_ARTICLE_BYTES,
      accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
    })
    const dom = new JSDOM(html, { url })
    try {
      const reader = new Readability(dom.window.document)
      const article = reader.parse()
      return article?.textContent || ''
    } finally {
      dom.window.close()
    }
  } catch (error) {
    console.error(`Error fetching full article from ${url}:`, error)
    return ''
  }
}

export function parsePublishedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function validatePublisherUrl(
  rawUrl: string,
  allowedDomains: readonly string[],
  baseUrl?: string
): string {
  let url: URL
  try {
    url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl)
  } catch {
    throw new Error('Invalid publisher URL')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error('Publisher URLs cannot contain credentials')
  }
  if (
    url.port &&
    !((url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80'))
  ) {
    throw new Error('Publisher URLs cannot use a non-standard port')
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const isAllowed = allowedDomains.some((rawDomain) => {
    const domain = rawDomain.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
    return hostname === domain || hostname.endsWith(`.${domain}`)
  })

  if (!isAllowed) {
    throw new Error(`Publisher host is not allowed: ${hostname}`)
  }

  // Remove fragments because they are never sent to the server and only
  // create duplicate-looking links in the database.
  url.hostname = hostname
  url.hash = ''
  return url.toString()
}

async function fetchText(url: string, options: SecureFetchOptions): Promise<string> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)

  try {
    let currentUrl = validatePublisherUrl(url, options.allowedDomains)

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const response = await fetch(currentUrl, {
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: options.accept,
          'User-Agent': 'Mozilla/5.0 (compatible; GhanaNewsBot/1.0)',
        },
      })

      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()

        if (!location) {
          throw new Error(`HTTP ${response.status} redirect had no location`)
        }
        if (redirectCount === MAX_REDIRECTS) {
          throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS})`)
        }

        currentUrl = validatePublisherUrl(location, options.allowedDomains, currentUrl)
        continue
      }

      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`HTTP ${response.status}`)
      }

      return await readLimitedText(response, options.maxBytes)
    }

    // The loop either returns a response body or throws at its redirect cap.
    throw new Error('Unable to fetch publisher URL')
  } catch (error) {
    if (timedOut) {
      throw new Error(`Request timed out after ${options.timeoutMs}ms`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength)
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      await response.body?.cancel()
      throw new Error(`Response exceeded the ${maxBytes}-byte limit`)
    }
  }

  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    bytesRead += value.byteLength
    if (bytesRead > maxBytes) {
      await reader.cancel()
      throw new Error(`Response exceeded the ${maxBytes}-byte limit`)
    }

    text += decoder.decode(value, { stream: true })
  }

  return text + decoder.decode()
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}
