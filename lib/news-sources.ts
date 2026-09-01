export interface NewsSource {
  url: string
  source: string
  allowedDomains: readonly string[]
}

export const NEWS_SOURCES: readonly NewsSource[] = [
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
]

export function allowedDomainsForSource(source: string): readonly string[] | null {
  return NEWS_SOURCES.find((candidate) => candidate.source === source)?.allowedDomains ?? null
}
