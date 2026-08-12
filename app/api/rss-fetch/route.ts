import { NextRequest, NextResponse } from 'next/server'
import { fetchAndStoreArticles } from '@/lib/rss-service'

// Triggered by an external scheduler (Vercel Cron or a GitHub Actions
// workflow) instead of an in-process node-cron job, since serverless
// functions don't have a long-running process to host a cron tick.
//
// Vercel Cron automatically sends `Authorization: Bearer $CRON_SECRET`
// when a CRON_SECRET env var is set on the project, so this doubles as
// both the trigger and the auth check.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // refuse to run unauthenticated in any environment

  const header = request.headers.get('authorization')
  return header === `Bearer ${secret}`
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await fetchAndStoreArticles()
    return NextResponse.json({
      message: 'RSS feed fetch completed',
      ...result,
    })
  } catch (error) {
    console.error('Error in RSS fetch:', error)
    return NextResponse.json(
      { error: 'Failed to fetch RSS feeds' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
