import { NextResponse } from 'next/server'
import { fetchAndStoreArticles } from '@/lib/rss-service'

export async function POST() {
  try {
    console.log('Starting RSS feed fetch...')
    const result = await fetchAndStoreArticles()

    return NextResponse.json({
      message: 'RSS feed fetch completed',
      success: result.success,
      failed: result.failed,
    })
  } catch (error) {
    console.error('Error in RSS fetch:', error)
    return NextResponse.json(
      { error: 'Failed to fetch RSS feeds' },
      { status: 500 }
    )
  }
}
