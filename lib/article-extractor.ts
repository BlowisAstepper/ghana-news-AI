import * as cheerio from 'cheerio'
import { fetchPublisherText } from './publisher-fetch'

const ARTICLE_TIMEOUT_MS = 4_000
const MAX_ARTICLE_BYTES = 2 * 1024 * 1024
const MAX_EXTRACTED_CHARS = 50_000
const MIN_PREFERRED_CONTENT_CHARS = 80

const ARTICLE_SELECTORS = [
  '[itemprop="articleBody"]',
  'article .entry-content',
  'article .post-content',
  'article .article-content',
  'article .story-content',
  'article',
  'main',
]

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

  const $ = cheerio.load(html)
  $(
    'script, style, noscript, iframe, nav, header, footer, aside, form, svg, ' +
      '.related-posts, .recommended, .social-share, .share-buttons, .advertisement, .ads'
  ).remove()

  let bestContent = ''
  for (const selector of ARTICLE_SELECTORS) {
    let selectorContent = ''
    $(selector).each((_, element) => {
      const content = normalizeText($(element).text())
      if (content.length > selectorContent.length) selectorContent = content
      if (content.length > bestContent.length) bestContent = content
    })

    // Prefer a publisher's explicit article-body container over a larger
    // wrapper that may also contain a headline or recommendations.
    if (selectorContent.length >= MIN_PREFERRED_CONTENT_CHARS) {
      return selectorContent.slice(0, MAX_EXTRACTED_CHARS)
    }
  }

  if (!bestContent) bestContent = normalizeText($('body').text())
  return bestContent.slice(0, MAX_EXTRACTED_CHARS)
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
