export interface DuplicateSource {
  source: string
  link: string
  title: string
}

export interface Article {
  id: string
  title: string
  link: string
  content: string
  source: string
  publishedAt: string | null
  createdAt: string
  summary?: string | null
  duplicates?: DuplicateSource[]
}

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number
}
