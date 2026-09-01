import { NextRequest, NextResponse } from 'next/server'
import { fetchAndStoreArticles } from '@/lib/rss-service'
import { isRssFetchAuthorized } from '@/lib/rss-auth'

// Vercel's default serverless timeout is too tight for this route: two RSS
// feeds to fetch, a Neon cold-start if the DB was suspended, plus a Gemini
// call for dedup can add up past 10s. Give it real room.
export const maxDuration = 60
export const runtime = 'nodejs'

// Triggered by an external scheduler (Vercel Cron or a GitHub Actions
// workflow) instead of an in-process node-cron job, since serverless
// functions don't have a long-running process to host a cron tick.
//
async function handle(request: NextRequest) {
  if (!(await isRssFetchAuthorized(request.headers.get('authorization')))) {
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
