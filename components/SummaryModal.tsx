'use client'

import { useEffect, useState } from 'react'
import { Article } from '@/types/article'

interface SummaryModalProps {
  article: Article
  onClose: () => void
}

// How long the enter/exit transition takes — kept in one place so the CSS
// duration and the exit-delay timeout below can't drift out of sync.
const TRANSITION_MS = 200

export default function SummaryModal({ article, onClose }: SummaryModalProps) {
  // Pre-seed from the article if it was already summarized on an earlier
  // fetch (e.g. list re-rendered) — avoids a pointless loading flash.
  const [summary, setSummary] = useState<string | null>(article.summary ?? null)
  const [loading, setLoading] = useState(!article.summary)
  const [error, setError] = useState<string | null>(null)

  // visible drives the enter transition (starts false, flips true a frame
  // after mount so the browser has something to transition *from*); closing
  // drives the exit transition, with the real onClose delayed to let it play.
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  const handleClose = () => {
    setClosing(true)
    window.setTimeout(onClose, TRANSITION_MS)
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (summary) return // already have it, nothing to fetch

    // An AbortController — not just an "ignore the result" flag — matters
    // here specifically because the request costs real, rate-limited API
    // quota. React's StrictMode double-invokes every effect once in dev
    // (mount → discard → mount again, on purpose, to catch exactly this
    // class of bug); without actually cancelling the network request, the
    // throwaway first call still reaches Gemini and burns a call for
    // nothing, silently doubling every summarize request.
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: article.id }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to summarize')
        return res.json()
      })
      .then((data) => {
        setSummary(data.summary)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return // cancelled, not a real failure
        setError('Could not summarize this article right now.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id])

  // Escape-to-close + lock background scroll while the modal is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = visible && !closing

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity ease-out ${shown ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 p-6 transition-all ease-out ${shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Article summary"
      >
        <div className="flex items-start justify-between mb-4">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {article.source}
          </span>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 leading-snug">
          {article.title}
        </h2>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
            Summarizing...
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400 py-2">{error}</p>}

        {!loading && !error && summary && (
          <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{summary}</p>
        )}

        {article.duplicates && article.duplicates.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">
              Also reported by
            </p>
            <div className="flex flex-wrap gap-2">
              {article.duplicates.map((dup) => (
                <a
                  key={dup.link}
                  href={dup.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors duration-150"
                >
                  {dup.source}
                </a>
              ))}
            </div>
          </div>
        )}

        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link mt-5 inline-flex items-center text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200"
        >
          Read full article
          <svg
            className="ml-1 w-4 h-4 transition-transform duration-200 group-hover/link:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>
    </div>
  )
}
