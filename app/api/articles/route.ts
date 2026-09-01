import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { truncateForApi } from '@/lib/format'
import { parsePagination, parseSource } from '@/lib/api-params'
import { toPublicDatabaseError } from '@/lib/database-errors'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pagination = parsePagination(searchParams)
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 })
    }

    const sourceResult = parseSource(searchParams.get('source'))
    if (!sourceResult.ok) {
      return NextResponse.json({ error: sourceResult.error }, { status: 400 })
    }

    const { page, limit } = pagination.value
    const source = sourceResult.value

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
    const publicError = toPublicDatabaseError(error)
    return NextResponse.json(
      { error: publicError.message, code: publicError.code },
      { status: publicError.status }
    )
  }
}

// Note: there's deliberately no POST here. Articles only ever come in
// through the RSS ingestion pipeline (see /api/rss-fetch); a public write
// endpoint would just be an unauthenticated way to inject arbitrary content.
