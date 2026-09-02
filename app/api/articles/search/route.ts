import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { truncateForApi } from '@/lib/format'
import { parsePagination, parseSearchQuery, parseSource } from '@/lib/api-params'
import { toPublicDatabaseError } from '@/lib/database-errors'
import { buildSearchVariants } from '@/lib/search-query'

type RankedArticle = {
  id: string
  relevance: number
}

type SearchCount = {
  total: number
}

function searchDocument(articleAlias: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(
    setweight(to_tsvector('english'::regconfig, coalesce(${articleAlias}."title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(${articleAlias}."summary", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(${articleAlias}."content", '')), 'C') ||
    setweight(to_tsvector('english'::regconfig, coalesce(${articleAlias}."source", '')), 'D')
  )`
}

function searchExpression(query: string): Prisma.Sql {
  const variants = buildSearchVariants(query)
  return Prisma.sql`(${Prisma.join(
    variants.map(
      (variant) => Prisma.sql`websearch_to_tsquery('english'::regconfig, ${variant})`
    ),
    ' || '
  )})`
}

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

    if (!query) {
      return NextResponse.json({
        articles: [],
        pagination: { page, limit, total: 0, pages: 0 },
      })
    }

    const articleAlias = Prisma.raw('a')
    const document = searchDocument(articleAlias)
    const tsQuery = searchExpression(query)
    const sourceFilter = source
      ? Prisma.sql`AND a."source" = ${source}`
      : Prisma.empty

    // PostgreSQL's English full-text configuration stems related word forms
    // (death/deaths, tax/taxes) and matches complete lexemes, so a short query
    // such as GRA no longer returns words that merely contain those letters.
    // Headline matches carry the most weight, followed by cached summaries and
    // the full publisher text. A GIN index keeps this fast as retention grows.
    const [rankedArticles, countRows] = await Promise.all([
      prisma.$queryRaw<RankedArticle[]>(Prisma.sql`
        WITH matching AS (
          SELECT
            a."id",
            a."publishedAt",
            a."createdAt",
            ts_rank_cd(${document}, ${tsQuery})::float8 AS relevance
          FROM "Article" a
          WHERE a."mergedIntoId" IS NULL
            ${sourceFilter}
            AND ${document} @@ ${tsQuery}
        )
        SELECT "id", relevance
        FROM matching
        ORDER BY relevance DESC, coalesce("publishedAt", "createdAt") DESC
        LIMIT ${limit}
        OFFSET ${skip}
      `),
      prisma.$queryRaw<SearchCount[]>(Prisma.sql`
        SELECT count(*)::int AS total
        FROM "Article" a
        WHERE a."mergedIntoId" IS NULL
          ${sourceFilter}
          AND ${document} @@ ${tsQuery}
      `),
    ])

    const ids = rankedArticles.map((article) => article.id)
    const rawArticles = ids.length
      ? await prisma.article.findMany({
          where: { id: { in: ids } },
          include: {
            duplicates: { select: { source: true, link: true, title: true } },
          },
        })
      : []

    const positionById = new Map(ids.map((id, position) => [id, position]))
    rawArticles.sort(
      (left, right) =>
        (positionById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (positionById.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    )

    const articles = rawArticles.map((article) => ({
      ...article,
      content: truncateForApi(article.content),
    }))
    const total = countRows[0]?.total ?? 0

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
