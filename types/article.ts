export interface Article {
  id: string
  title: string
  link: string
  content: string
  source: string
  publishedAt: string | null
  createdAt: string
}

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number
}
