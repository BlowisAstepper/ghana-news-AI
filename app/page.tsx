'use client'

import Image from 'next/image'
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
      <header className="news-masthead">
        <div className="ghana-ribbon" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          <div className="flex items-center justify-between gap-3 sm:gap-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-5">
              <div className="brand-mascot shrink-0">
                <Image
                  src="/ghana-news-mascot.png"
                  alt="Cheerful Ghana News Hub newspaper mascot"
                  width={384}
                  height={384}
                  priority
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                  </span>
                  Ghana&apos;s live news desk
                </div>
                <h1 className="brand-wordmark text-gray-950 dark:text-white">
                  <span>Ghana</span>{' '}
                  <span className="brand-wordmark-accent">News Hub</span>
                </h1>
                <p className="mt-2 hidden text-sm font-medium text-gray-600 dark:text-gray-300 sm:block">
                  Ghana&apos;s biggest stories, gathered and simplified.
                </p>
              </div>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
              aria-label={refreshing ? 'Refreshing articles' : 'Refresh articles'}
              className="refresh-feed group"
            >
              <span className="refresh-feed-icon">
                <svg
                  className={`h-5 w-5 transition-transform duration-500 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M20 7v5h-5M4 17v-5h5m9.2-3A7 7 0 006.6 7.1L4 12m16 0-2.6 4.9A7 7 0 015.8 15"
                  />
                </svg>
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-extrabold leading-tight">
                  {refreshing ? 'Updating…' : 'Refresh feed'}
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  Get the latest stories
                </span>
              </span>
            </button>
          </div>

          <div className="mt-5 sm:mt-7">
            <SearchBar onSearch={handleSearch} loading={articlesLoading} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9">
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
