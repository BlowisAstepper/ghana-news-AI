import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { refreshIfStale } from '@/lib/rss-service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const source = searchParams.get('source') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')

    const skip = (page - 1) * limit

    const where: Prisma.ArticleWhereInput = {}

    if (query.trim()) {
      // Postgres's `contains` is case-sensitive unless told otherwise
      // (unlike SQLite's default LIKE behavior, which this used to rely on).
      where.OR = [
        { title: { contains: query.trim(), mode: 'insensitive' } },
        { content: { contains: query.trim(), mode: 'insensitive' } },
      ]
    }

    if (source) {
      where.source = source
    }

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.article.count({ where }),
    ])

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
    console.error('Search articles error:', error)
    return NextResponse.json(
      { error: 'Failed to search articles' },
      { status: 500 }
    )
  }
}
