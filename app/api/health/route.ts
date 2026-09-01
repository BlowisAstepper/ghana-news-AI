import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { toPublicDatabaseError } from '@/lib/database-errors'

export const dynamic = 'force-dynamic'

export async function GET() {
  const configuration = {
    database: Boolean(process.env.DATABASE_URL),
    cronAuthentication: Boolean(process.env.CRON_SECRET),
    githubOidcAuthentication: true,
    aiSummaries: Boolean(process.env.GEMINI_API_KEY),
  }

  if (!configuration.database) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        checkedAt: new Date().toISOString(),
        configuration,
        database: { status: 'unavailable', code: 'DATABASE_URL_MISSING' },
      },
      { status: 503 }
    )
  }

  try {
    // Explicitly touch fields/tables from every migration. This catches an
    // outdated production schema even when Article is currently empty.
    await prisma.$transaction([
      prisma.article.findFirst({
        select: { id: true, summary: true, mergedIntoId: true },
      }),
      prisma.summaryGeneration.count(),
      prisma.rateLimitBucket.count(),
    ])

    const degraded =
      (!configuration.cronAuthentication &&
        !configuration.githubOidcAuthentication) ||
      !configuration.aiSummaries
    return NextResponse.json({
      status: degraded ? 'degraded' : 'ok',
      checkedAt: new Date().toISOString(),
      configuration,
      database: { status: 'ok' },
    })
  } catch (error) {
    console.error('Health check database error:', error)
    const publicError = toPublicDatabaseError(error)
    return NextResponse.json(
      {
        status: 'unhealthy',
        checkedAt: new Date().toISOString(),
        configuration,
        database: { status: 'unavailable', code: publicError.code },
      },
      { status: publicError.status }
    )
  }
}
