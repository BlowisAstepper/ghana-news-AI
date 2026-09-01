import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import { fetchPublisherText } from './publisher-fetch'

const ARTICLE_TIMEOUT_MS = 4_000
const MAX_ARTICLE_BYTES = 2 * 1024 * 1024

export async function fetchFullArticleContent(
  url: string,
  allowedDomains: readonly string[]
): Promise<string> {
  const html = await fetchPublisherText(url, {
    allowedDomains,
    timeoutMs: ARTICLE_TIMEOUT_MS,
    maxBytes: MAX_ARTICLE_BYTES,
    accept: 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5',
  })
  const dom = new JSDOM(html, { url })

  try {
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    return article?.textContent?.trim() || ''
  } finally {
    dom.window.close()
  }
}
