'use client';

import React, { useState, useCallback } from 'react';

interface SearchBarProps {
  onSearch: (query: string, source?: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading = false }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState('');

  const handleSearch = useCallback(() => {
    onSearch(query.trim(), selectedSource || undefined);
  }, [query, selectedSource, onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSelectedSource('');
    onSearch('', undefined);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-4 sm:p-5 border border-gray-200 dark:border-gray-800">
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search news articles..."
            className="block w-full pl-11 pr-4 py-2.5 rounded-full leading-5 bg-gray-50 dark:bg-gray-800 border border-transparent placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white dark:focus:bg-gray-900 focus:border-red-200 dark:focus:border-red-900 text-gray-900 dark:text-white transition-colors duration-200"
            disabled={loading}
          />
        </div>

        {/* Source Filter */}
        <div className="md:w-44">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="block w-full px-4 py-2.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-transparent text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white dark:focus:bg-gray-900 transition-colors duration-200"
            disabled={loading}
          >
            <option value="">All Sources</option>
            <option value="MyJoyOnline">MyJoyOnline</option>
            <option value="3News">3News</option>
          </select>
        </div>

        {/* Search Button */}
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-6 py-2.5 bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-full shadow-sm shadow-red-500/20 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
        >
          {loading ? (
            <div className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Searching...
            </div>
          ) : (
            'Search'
          )}
        </button>

        {/* Clear Button */}
        {(query || selectedSource) && (
          <button
            onClick={clearSearch}
            className="px-4 py-2.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 font-medium rounded-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            disabled={loading}
          >
            Clear
          </button>
        )}
      </div>

      {/* Search Tips */}
      <p className="mt-3 px-1 text-xs text-gray-400 dark:text-gray-500">
        Search by keywords in article titles and content, or filter by source.
      </p>
    </div>
  );
}
