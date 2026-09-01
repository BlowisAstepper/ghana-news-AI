import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRSSFeed, MAX_ITEMS_PER_SOURCE, parsePublishedDate } from './rss-parser'
import { validatePublisherUrl } from './publisher-fetch'

const DOMAINS = ['myjoyonline.com']

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('validatePublisherUrl', () => {
  it('accepts the publisher and its subdomains and strips fragments', () => {
    expect(
      validatePublisherUrl('https://www.myjoyonline.com/story#comments', DOMAINS)
    ).toBe('https://www.myjoyonline.com/story')
    expect(validatePublisherUrl('https://myjoyonline.com/feed/', DOMAINS)).toBe(
      'https://myjoyonline.com/feed/'
    )
  })

  it.each([
    'https://myjoyonline.com.evil.example/story',
    'https://evil.example/story',
    'file:///etc/passwd',
    'https://user:password@myjoyonline.com/story',
    'https://myjoyonline.com:444/story',
  ])('rejects an unsafe publisher URL: %s', (url) => {
    expect(() => validatePublisherUrl(url, DOMAINS)).toThrow()
  })

  it('validates redirects and relative article links against the same publisher', () => {
    expect(
      validatePublisherUrl('/news/story', DOMAINS, 'https://www.myjoyonline.com/feed/')
    ).toBe('https://www.myjoyonline.com/news/story')
    expect(() =>
      validatePublisherUrl('https://evil.example/redirect', DOMAINS)
    ).toThrow()
  })
})

describe('parsePublishedDate', () => {
  it('returns undefined for missing or malformed feed dates', () => {
    expect(parsePublishedDate(undefined)).toBeUndefined()
    expect(parsePublishedDate('not-a-date')).toBeUndefined()
  })

  it('returns a valid Date when the feed date is valid', () => {
    expect(parsePublishedDate('2026-08-29T10:00:00Z')?.toISOString()).toBe(
      '2026-08-29T10:00:00.000Z'
    )
  })
})

describe('fetchRSSFeed', () => {
  it('stores feed excerpts without fetching every full publisher page', async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel><title>News</title>
        <item>
          <title>Example headline</title>
          <link>https://www.myjoyonline.com/example-story</link>
          <description>Useful short excerpt.</description>
          <pubDate>Sat, 29 Aug 2026 10:00:00 GMT</pubDate>
        </item>
      </channel></rss>`
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(xml, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const articles = await fetchRSSFeed(
      'https://www.myjoyonline.com/feed/',
      'MyJoyOnline',
      DOMAINS
    )

    expect(articles).toHaveLength(1)
    expect(articles[0].content).toBe('Useful short excerpt.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('bounds each scheduled source import', async () => {
    const items = Array.from(
      { length: MAX_ITEMS_PER_SOURCE + 5 },
      (_, index) => `<item>
        <title>Headline ${index}</title>
        <link>https://www.myjoyonline.com/story-${index}</link>
        <description>Excerpt ${index}</description>
      </item>`
    ).join('')
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>${items}</channel></rss>`
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(xml, { status: 200 })))

    const articles = await fetchRSSFeed(
      'https://www.myjoyonline.com/feed/',
      'MyJoyOnline',
      DOMAINS
    )

    expect(articles).toHaveLength(MAX_ITEMS_PER_SOURCE)
  })
})
