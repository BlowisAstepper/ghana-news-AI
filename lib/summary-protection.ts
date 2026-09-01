import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

const RATE_WINDOW_MS = 60_000
const CLAIM_TTL_MS = 2 * 60_000
const CONCURRENT_WAIT_MS = 4_000
const CONCURRENT_POLL_MS = 250

const DEFAULT_GLOBAL_LIMIT = 10
const DEFAULT_CLIENT_LIMIT = 5

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function clientFingerprint(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwardedFor || request.headers.get('x-real-ip') || 'unknown'
  const userAgent = request.headers.get('user-agent') || 'unknown'

  // A one-way identifier is enough for abuse control; never persist the raw
  // address in the database.
  return createHash('sha256').update(`${address}|${userAgent}`).digest('hex').slice(0, 32)
}

export type SummaryRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; scope: 'global' | 'client' }

export async function consumeSummaryRateLimit(
  request: Request,
  now = new Date()
): Promise<SummaryRateLimitResult> {
  const globalLimit = positiveIntegerFromEnv(
    'SUMMARY_GLOBAL_RATE_LIMIT_PER_MINUTE',
    DEFAULT_GLOBAL_LIMIT
  )
  const clientLimit = positiveIntegerFromEnv(
    'SUMMARY_CLIENT_RATE_LIMIT_PER_MINUTE',
    DEFAULT_CLIENT_LIMIT
  )

  const windowStartMs = Math.floor(now.getTime() / RATE_WINDOW_MS) * RATE_WINDOW_MS
  const expiresAt = new Date(windowStartMs + RATE_WINDOW_MS)
  const windowKey = String(windowStartMs)
  const fingerprint = clientFingerprint(request)

  // Keep this small operational table self-cleaning. Deleting expired rows is
  // cheap because expiresAt is indexed.
  await prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } })

  const [globalBucket, clientBucket] = await prisma.$transaction([
    prisma.rateLimitBucket.upsert({
      where: { id: `summary:global:${windowKey}` },
      create: { id: `summary:global:${windowKey}`, count: 1, expiresAt },
      update: { count: { increment: 1 } },
      select: { count: true },
    }),
    prisma.rateLimitBucket.upsert({
      where: { id: `summary:client:${fingerprint}:${windowKey}` },
      create: {
        id: `summary:client:${fingerprint}:${windowKey}`,
        count: 1,
        expiresAt,
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    }),
  ])

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)
  )

  if (globalBucket.count > globalLimit) {
    return { allowed: false, retryAfterSeconds, scope: 'global' }
  }
  if (clientBucket.count > clientLimit) {
    return { allowed: false, retryAfterSeconds, scope: 'client' }
  }
  return { allowed: true }
}

export async function acquireSummaryGeneration(articleId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS)
  await prisma.summaryGeneration.deleteMany({
    where: { articleId, startedAt: { lt: staleBefore } },
  })

  try {
    await prisma.summaryGeneration.create({ data: { articleId } })
    return true
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return false
    }
    throw error
  }
}

export async function releaseSummaryGeneration(articleId: string): Promise<void> {
  await prisma.summaryGeneration.deleteMany({ where: { articleId } })
}

export async function waitForConcurrentSummary(articleId: string): Promise<string | null> {
  const deadline = Date.now() + CONCURRENT_WAIT_MS

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, CONCURRENT_POLL_MS))
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { summary: true },
    })
    if (article?.summary) return article.summary
    if (!article) return null
  }

  return null
}
