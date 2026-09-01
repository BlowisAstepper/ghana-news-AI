'use client'

import { useCallback, useState } from 'react'
import ArticleList from '../components/ArticleList'
import SearchBar from '../components/SearchBar'

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSource, setSearchSource] = useState<string | undefined>()
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [articlesLoading, setArticlesLoading] = useState(false)

  const handleSearch = (query: string, source?: string) => {
    setSearchQuery(query)
    setSearchSource(source)
  }

  const handleRefresh = () => {
    setRefreshing(true)
    setRefreshKey((key) => key + 1)
  }

  const handleArticlesLoadingChange = useCallback((isLoading: boolean) => {
    setArticlesLoading(isLoading)
    if (!isLoading) setRefreshing(false)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/25 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  Ghana News Hub
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Latest news from Ghana&apos;s leading sources
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              aria-label={refreshing ? 'Refreshing articles' : 'Refresh articles'}
              className="group inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:border-red-200 dark:hover:border-red-900/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950 transition-colors duration-200"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-500 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <SearchBar onSearch={handleSearch} loading={articlesLoading} />
        </div>

        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {searchQuery ? `Results for "${searchQuery}"` : 'Latest News'}
            </h2>
            {searchSource && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                Source: {searchSource}
              </span>
            )}
          </div>

          <ArticleList
            searchQuery={searchQuery}
            searchSource={searchSource}
            refreshKey={refreshKey}
            onLoadingChange={handleArticlesLoadingChange}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-sm text-gray-500 dark:text-gray-500">
              © 2026 Ghana News Hub. All rights reserved.
            </div>
            <div className="flex items-center gap-4 text-sm">
              <a
                href="https://www.myjoyonline.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
              >
                MyJoyOnline
              </a>
              <a
                href="https://3news.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
              >
                3News
              </a>
            </div>
          </div>
          <p className="mt-4 text-center md:text-left text-[11px] leading-relaxed text-gray-400 dark:text-gray-600">
            This is a personal, non-commercial project. Articles are aggregated from their original
            publishers, credited, and linked back to source — we don&apos;t claim ownership of their
            reporting or run ads against it.
          </p>
        </div>
      </footer>
    </div>
  )
}
