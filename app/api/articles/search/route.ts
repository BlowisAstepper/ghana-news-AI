import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { truncateForApi } from '@/lib/format'
import { parsePagination, parseSearchQuery, parseSource } from '@/lib/api-params'
import { toPublicDatabaseError } from '@/lib/database-errors'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pagination = parsePagination(searchParams)
    if (!pagination.ok) {
      return NextResponse.json({ error: pagination.error }, { status: 400 })
    }

    const queryResult = parseSearchQuery(searchParams.get('q'))
    if (!queryResult.ok) {
      return NextResponse.json({ error: queryResult.error }, { status: 400 })
    }
    const sourceResult = parseSource(searchParams.get('source'))
    if (!sourceResult.ok) {
      return NextResponse.json({ error: sourceResult.error }, { status: 400 })
    }

    const { page, limit } = pagination.value
    const query = queryResult.value
    const source = sourceResult.value

    const skip = (page - 1) * limit

    // mergedIntoId: null excludes articles folded into another source's
    // coverage of the same story — see lib/dedupe.ts.
    const where: Prisma.ArticleWhereInput = { mergedIntoId: null }

    if (query) {
      // Postgres's `contains` is case-sensitive unless told otherwise
      // (unlike SQLite's default LIKE behavior, which this used to rely on).
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ]
    }

    if (source) {
      where.source = source
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
    console.error('Search articles error:', error)
    const publicError = toPublicDatabaseError(error)
    return NextResponse.json(
      { error: publicError.message, code: publicError.code },
      { status: publicError.status }
    )
  }
}
