import Parser from 'rss-parser'
import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
      ['content:encoded', 'content:encoded'],
    ]
  }
})

export interface ParsedArticle {
  title: string
  link: string
  content: string
  source: string
  publishedAt?: Date
}

export async function fetchRSSFeed(url: string, source: string): Promise<ParsedArticle[]> {
  try {
    const feed = await parser.parseURL(url)

    const articles: ParsedArticle[] = []

    for (const item of feed.items || []) {
      try {
        let content = item.content || item['content:encoded'] || item.summary || ''

        // If content is minimal, try to fetch full article
        if (content.length < 200 && item.link) {
          try {
            content = await fetchFullArticle(item.link)
          } catch (error) {
            console.warn(`Failed to fetch full article for ${item.link}:`, error)
          }
        }

        // Clean up HTML content
        const $ = cheerio.load(content)
        $('script, style, iframe, nav, header, footer, aside').remove()
        const cleanContent = $.text().trim()

        if (item.title && item.link && cleanContent) {
          articles.push({
            title: item.title.trim(),
            link: item.link.trim(),
            content: cleanContent,
            source,
            publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
          })
        }
      } catch (error) {
        console.error(`Error processing article from ${source}:`, error)
      }
    }

    return articles
  } catch (error) {
    console.error(`Error fetching RSS feed from ${url}:`, error)
    return []
  }
}

async function fetchFullArticle(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhanaNewsBot/1.0)',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    return article?.textContent || ''
  } catch (error) {
    console.error(`Error fetching full article from ${url}:`, error)
    return ''
  }
}
