import { NextRequest, NextResponse, after } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { refreshIfStale } from '@/lib/rss-service'
import { truncateForApi } from '@/lib/format'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const source = searchParams.get('source')

    const skip = (page - 1) * limit
    // mergedIntoId: null excludes articles that got folded into another
    // source's coverage of the same story — only canonical entries show up
    // in listings; see lib/dedupe.ts.
    const where: Prisma.ArticleWhereInput = {
      mergedIntoId: null,
      ...(source ? { source } : {}),
    }

    const [rawArticles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
        include: {
          duplicates: { select: { source: true, link: true, title: true } },
        },
      }),
      prisma.article.count({ where }),
    ])

    const articles = rawArticles.map((article) => ({
      ...article,
      content: truncateForApi(article.content),
    }))

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
