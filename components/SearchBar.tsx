'use client'

import { FormEvent, useCallback, useState } from 'react'

interface SearchBarProps {
  onSearch: (query: string, source?: string) => void
  loading?: boolean
}

const SOURCE_OPTIONS = [
  { value: '', label: 'All stories' },
  { value: 'MyJoyOnline', label: 'MyJoyOnline' },
  { value: '3News', label: '3News' },
] as const

export default function SearchBar({ onSearch, loading = false }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState('')

  const handleSearch = useCallback(() => {
    onSearch(query.trim(), selectedSource || undefined)
  }, [onSearch, query, selectedSource])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleSearch()
  }

  const clearSearch = () => {
    setQuery('')
    setSelectedSource('')
    onSearch('', undefined)
  }

  return (
    <section className="search-panel" aria-label="Search Ghana News Hub">
      <div className="search-panel-heading">
        <span>Search the newsroom</span>
        <strong>Find the story that matters to you.</strong>
      </div>

      <form onSubmit={handleSubmit} className="min-w-0 flex-1">
        <div className="search-field-row">
          <div className="search-field">
            <svg
              className="h-5 w-5 shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="m21 21-4.35-4.35m1.35-5.4a6.75 6.75 0 1 1-13.5 0 6.75 6.75 0 0 1 13.5 0Z"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search politics, business, sports…"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-gray-950 outline-none placeholder:font-normal placeholder:text-gray-400 disabled:cursor-wait dark:text-white dark:placeholder:text-gray-500"
              disabled={loading}
              aria-label="Search news articles"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                aria-label="Clear search text"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <button type="submit" disabled={loading} className="search-submit">
            {loading ? (
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-90" fill="currentColor" d="M12 3a9 9 0 0 0-9 9h3a6 6 0 0 1 6-6V3Z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="m5 12 4 4L19 6" />
              </svg>
            )}
            <span>{loading ? 'Searching…' : 'Search news'}</span>
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.13em] text-gray-400 dark:text-gray-500">
            From
          </span>
          {SOURCE_OPTIONS.map((source) => (
            <button
              key={source.value || 'all'}
              type="button"
              onClick={() => setSelectedSource(source.value)}
              disabled={loading}
              aria-pressed={selectedSource === source.value}
              className={`source-chip ${selectedSource === source.value ? 'source-chip-active' : ''}`}
            >
              {source.label}
            </button>
          ))}

          {(query || selectedSource) && (
            <button
              type="button"
              onClick={clearSearch}
              disabled={loading}
              className="ml-auto text-xs font-bold text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-gray-400 dark:decoration-gray-700 dark:hover:text-red-400"
            >
              Reset search
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
