import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { summarizeArticle } from '@/lib/summarize'

export async function POST(request: NextRequest) {
  let id: unknown
  try {
    ;({ id } = await request.json())
  } catch {
    // Most commonly a request the browser aborted before finishing sending
    // its body (e.g. React StrictMode's dev-only double-invoke cancelling a
    // throwaway call — see components/SummaryModal.tsx) rather than an
    // actual malformed client request. Quiet 400, no stack trace: this is
    // routine, not worth logging as an error.
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Missing article id' }, { status: 400 })
    }

    const article = await prisma.article.findUnique({ where: { id } })
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    // Already summarized — serve the cached copy instead of calling Gemini
    // again. This is the whole cost story for this endpoint: spend is
    // bounded by "unique articles ever opened", not by page views.
    if (article.summary) {
      return NextResponse.json({ summary: article.summary })
    }

    const summary = await summarizeArticle(article.title, article.content)

    if (!summary) {
      return NextResponse.json({ error: 'Summary came back empty' }, { status: 502 })
    }

    await prisma.article.update({
      where: { id },
      data: { summary },
    })

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('Error summarizing article:', error)
    return NextResponse.json({ error: 'Failed to summarize article' }, { status: 500 })
  }
}
