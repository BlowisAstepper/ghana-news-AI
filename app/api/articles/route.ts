import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshIfStale } from '@/lib/rss-service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const source = searchParams.get('source')

    const skip = (page - 1) * limit
    const where = source ? { source } : {}

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
    ])

    // Fires after the response is already on its way to the browser, so a
    // stale/empty DB never makes a visitor wait on a live RSS fetch — this
    // request still serves whatever's on hand, and the *next* one benefits.
    after(() => refreshIfStale().catch((err) => console.error('Background refresh failed:', err)))

    return NextResponse.json({
      articles,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching articles:', error)
    return NextResponse.json(
      { error: 'Failed to fetch articles' },
      { status: 500 }
    )
  }
}

// Note: there's deliberately no POST here. Articles only ever come in
// through the RSS ingestion pipeline (see /api/rss-fetch); a public write
// endpoint would just be an unauthenticated way to inject arbitrary content.
