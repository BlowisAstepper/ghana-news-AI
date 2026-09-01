'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ArticleCard from './ArticleCard'
import ArticleCardSkeleton from './ArticleCardSkeleton'
import SummaryModal from './SummaryModal'
import { Article, PaginationInfo } from '@/types/article'

interface ArticleListProps {
  searchQuery?: string
  searchSource?: string
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

export default function ArticleList({
  searchQuery = '',
  searchSource = '',
  refreshKey = 0,
  onLoadingChange,
}: ArticleListProps) {
  const [articles, setArticles] = useState<Article[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const latestRequestRef = useRef(0)
  const activeControllerRef = useRef<AbortController | null>(null)

  const fetchArticles = useCallback(async (page = 1) => {
    activeControllerRef.current?.abort()
    const controller = new AbortController()
    const requestId = ++latestRequestRef.current
    activeControllerRef.current = controller

    setLoading(true)
    onLoadingChange?.(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
      })

      let endpoint: string
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim())
        if (searchSource) params.set('source', searchSource)
        endpoint = `/api/articles/search?${params}`
      } else {
        if (searchSource) params.set('source', searchSource)
        endpoint = `/api/articles?${params}`
      }

      const response = await fetch(endpoint, { signal: controller.signal })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          data && typeof data.error === 'string'
            ? data.error
            : 'Failed to fetch articles'
        throw new Error(message)
      }
      if (!data || !Array.isArray(data.articles) || !data.pagination) {
        throw new Error('The news service returned an invalid response')
      }

      if (requestId !== latestRequestRef.current) return
      setArticles(data.articles)
      setPagination(data.pagination)
    } catch (err) {
      if (controller.signal.aborted || requestId !== latestRequestRef.current) return
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      if (requestId === latestRequestRef.current) {
        activeControllerRef.current = null
        setLoading(false)
        onLoadingChange?.(false)
      }
    }
  }, [onLoadingChange, searchQuery, searchSource])

  useEffect(() => {
    void fetchArticles(1)

    return () => {
      activeControllerRef.current?.abort()
      latestRequestRef.current += 1
    }
  }, [fetchArticles, refreshKey])

  if (loading && articles.length === 0) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ArticleCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (error && articles.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 mb-4">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Error loading articles</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-5">{error}</p>
        <button
          onClick={() => fetchArticles()}
          className="px-5 py-2.5 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium rounded-full shadow-sm shadow-red-500/20 transition-all duration-200"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && articles.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}. Previously loaded articles are shown below.
        </div>
      )}

      {articles.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 mb-4">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {searchQuery ? `No results for "${searchQuery}"` : 'No articles found'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery ? 'Try a different search term.' : 'Check back later for new articles.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`grid gap-6 md:grid-cols-2 lg:grid-cols-3 transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}
          >
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} onOpenSummary={setSelectedArticle} />
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8">
              <button
                onClick={() => fetchArticles(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
                aria-label="Go to previous page"
                className="p-2.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-red-200 dark:hover:border-red-900/60 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-800 text-gray-600 dark:text-gray-300 transition-colors duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                Page {pagination.page} of {pagination.pages}
              </span>

              <button
                onClick={() => fetchArticles(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages || loading}
                aria-label="Go to next page"
                className="p-2.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-red-200 dark:hover:border-red-900/60 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-800 text-gray-600 dark:text-gray-300 transition-colors duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {selectedArticle && (
        <SummaryModal
          key={selectedArticle.id}
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </div>
  )
}
