import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { summarizeArticle } from '@/lib/summarize'
import { toPublicDatabaseError } from '@/lib/database-errors'
import { allowedDomainsForSource } from '@/lib/news-sources'
import { fetchFullArticleContent } from '@/lib/article-extractor'
import { toPublicAiError } from '@/lib/ai-errors'
import {
  acquireSummaryGeneration,
  consumeSummaryRateLimit,
  releaseSummaryGeneration,
  waitForConcurrentSummary,
} from '@/lib/summary-protection'

export const maxDuration = 60
export const runtime = 'nodejs'

const MAX_REQUEST_BYTES = 1024
const MIN_CONTENT_FOR_SUMMARY = 800
const EXPANDED_CONTENT_TIMEOUT_MS = 18_000
const EXCERPT_FALLBACK_TIMEOUT_MS = 20_000

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
  }

  let id: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Request body is too large' }, { status: 413 })
    }
    const body = JSON.parse(rawBody) as { id?: unknown }
    id = body.id
  } catch {
    // Most commonly a request the browser aborted before finishing sending
    // its body (e.g. React StrictMode's dev-only double-invoke cancelling a
    // throwaway call — see components/SummaryModal.tsx) rather than an
    // actual malformed client request. Quiet 400, no stack trace: this is
    // routine, not worth logging as an error.
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    if (!id || typeof id !== 'string' || id.length > 128) {
      return NextResponse.json({ error: 'Missing article id' }, { status: 400 })
    }

    const article = await prisma.article.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        link: true,
        content: true,
        source: true,
        summary: true,
      },
    })
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    // Cached summaries cost no quota and do not enter the rate limiter.
    if (article.summary) {
      return NextResponse.json({ summary: article.summary })
    }

    // Claim generation in Postgres so separate Vercel instances cannot race
    // and spend Gemini quota summarizing the same article simultaneously.
    const ownsGeneration = await acquireSummaryGeneration(article.id)
    if (!ownsGeneration) {
      const concurrentSummary = await waitForConcurrentSummary(article.id)
      if (concurrentSummary) {
        return NextResponse.json({ summary: concurrentSummary })
      }

      return NextResponse.json(
        { error: 'This summary is already being generated. Please retry shortly.' },
        { status: 409, headers: { 'Retry-After': '2' } }
      )
    }

    try {
      const rateLimit = await consumeSummaryRateLimit(request)
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: 'Summary limit reached. Please try again shortly.' },
          {
            status: 429,
            headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
          }
        )
      }

      let summaryContent = article.content
      if (summaryContent.length < MIN_CONTENT_FOR_SUMMARY) {
        const allowedDomains = allowedDomainsForSource(article.source)
        if (allowedDomains) {
          try {
            const fullContent = await fetchFullArticleContent(article.link, allowedDomains)
            if (fullContent.length > summaryContent.length) summaryContent = fullContent
          } catch (extractionError) {
            // RSS excerpts are still useful enough for a best-effort summary;
            // publisher extraction failure should not make the feature fail.
            console.warn(`Full article extraction failed for ${article.link}:`, extractionError)
          }
        }
      }

      let summary: string
      try {
        summary = await summarizeArticle(article.title, summaryContent, {
          timeoutMs:
            summaryContent !== article.content
              ? EXPANDED_CONTENT_TIMEOUT_MS
              : undefined,
        })
      } catch (summaryError) {
        const publicAiError = toPublicAiError(summaryError)
        const canRetryWithExcerpt =
          summaryContent !== article.content &&
          (publicAiError?.code === 'AI_TIMEOUT' ||
            publicAiError?.code === 'AI_UPSTREAM_ERROR')

        if (!canRetryWithExcerpt) throw summaryError

        // Some publisher pages contain enough unrelated layout text to make
        // an otherwise simple model request stall. The clean RSS excerpt is
        // less detailed but remains grounded source material and is a much
        // better fallback than failing the article entirely.
        console.warn(
          `Expanded summary input failed for ${article.link}; retrying with RSS excerpt`
        )
        summaryContent = article.content
        summary = await summarizeArticle(article.title, article.content, {
          timeoutMs: EXCERPT_FALLBACK_TIMEOUT_MS,
        })
      }

      if (!summary) {
        return NextResponse.json({ error: 'Summary came back empty' }, { status: 502 })
      }

      await prisma.$transaction([
        prisma.article.update({
          where: { id: article.id },
          data: {
            summary,
            ...(summaryContent !== article.content ? { content: summaryContent } : {}),
          },
        }),
        prisma.summaryGeneration.deleteMany({ where: { articleId: article.id } }),
      ])

      return NextResponse.json({ summary })
    } finally {
      // No-op after the successful transaction; essential after rate limits,
      // empty model output, exceptions, or an interrupted request.
      await releaseSummaryGeneration(article.id).catch((releaseError) => {
        console.error('Failed to release summary generation claim:', releaseError)
      })
    }
  } catch (error) {
    console.error('Error summarizing article:', error)
    const aiError = toPublicAiError(error)
    if (aiError) {
      return NextResponse.json(
        { error: aiError.message, code: aiError.code },
        {
          status: aiError.status,
          headers: aiError.retryAfterSeconds
            ? { 'Retry-After': String(aiError.retryAfterSeconds) }
            : undefined,
        }
      )
    }

    const publicError = toPublicDatabaseError(error, 'Failed to summarize article')
    return NextResponse.json(
      { error: publicError.message, code: publicError.code },
      { status: publicError.status }
    )
  }
}
