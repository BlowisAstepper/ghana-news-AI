'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Article } from '@/types/article'

interface SummaryModalProps {
  article: Article
  onClose: () => void
}

// How long the enter/exit transition takes — kept in one place so the CSS
// duration and the exit-delay timeout below can't drift out of sync.
const TRANSITION_MS = 200
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface SummaryPayload {
  summary?: unknown
  error?: unknown
  message?: unknown
}

class SummaryRequestError extends Error {
  readonly status: number
  readonly retryAfterMs: number | null

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message)
    this.name = 'SummaryRequestError'
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

function parseRetryAfter(value: string | null) {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)

  const retryAt = Date.parse(value)
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now())
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The request was aborted.', 'AbortError'))
      return
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, delayMs)
    const handleAbort = () => {
      window.clearTimeout(timeout)
      reject(new DOMException('The request was aborted.', 'AbortError'))
    }

    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function getApiMessage(payload: SummaryPayload | null, fallback: string) {
  if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim()
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim()
  return fallback
}

async function requestSummary(articleId: string, signal: AbortSignal) {
  let hasRetriedConflict = false

  while (true) {
    const response = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: articleId }),
      signal,
    })
    const payload = (await response.json().catch(() => null)) as SummaryPayload | null

    if (response.ok) {
      if (typeof payload?.summary === 'string' && payload.summary.trim()) {
        return payload.summary.trim()
      }

      throw new SummaryRequestError('The summary service returned an empty response.', 502)
    }

    const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'))
    if (response.status === 409 && retryAfterMs !== null && !hasRetriedConflict) {
      hasRetriedConflict = true
      await waitForRetry(retryAfterMs, signal)
      continue
    }

    throw new SummaryRequestError(
      getApiMessage(payload, response.statusText || 'Could not summarize this article.'),
      response.status,
      retryAfterMs,
    )
  }
}

function getSummaryErrorMessage(error: unknown) {
  if (!(error instanceof SummaryRequestError)) {
    return 'Could not summarize this article right now.'
  }

  if (error.status === 429) {
    const waitSeconds = error.retryAfterMs === null
      ? null
      : Math.max(1, Math.ceil(error.retryAfterMs / 1000))
    return waitSeconds
      ? `Too many summary requests right now. Please wait about ${waitSeconds} seconds and try again.`
      : 'Too many summary requests right now. Please wait a moment and try again.'
  }

  if (error.status === 409) {
    return error.message || 'This summary is still being prepared. Please try again shortly.'
  }

  return error.message || 'Could not summarize this article right now.'
}

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
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  const handleClose = useCallback(() => {
    if (closingRef.current) return

    closingRef.current = true
    setClosing(true)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      onCloseRef.current()
    }, TRANSITION_MS)
  }, [])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (article.summary) return

    const controller = new AbortController()

    requestSummary(article.id, controller.signal)
      .then((nextSummary) => {
        setSummary(nextSummary)
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return // cancelled, not a real failure
        setError(getSummaryErrorMessage(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [article.id, article.summary])

  // Keep keyboard focus inside the dialog, restore it to the title that
  // opened the modal on exit, and lock background scrolling while open.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus())

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }

      if (e.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.tabIndex >= 0)

      if (focusableElements.length === 0) {
        e.preventDefault()
        dialog.focus()
        return
      }

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (e.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
    }
  }, [handleClose])

  const shown = visible && !closing

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity ease-out ${shown ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className={`w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 p-6 transition-all ease-out ${shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between mb-4">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {article.source}
          </span>
          <button
            ref={closeButtonRef}
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

        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white mb-3 leading-snug">
          {article.title}
        </h2>

        {loading && (
          <div
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4"
            role="status"
            aria-live="polite"
          >
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600" />
            Summarizing...
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 py-2" role="alert">
            {error}
          </p>
        )}

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
