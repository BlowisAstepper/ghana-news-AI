import { NextRequest, NextResponse } from 'next/server'
import { startRSSScheduler, stopRSSScheduler, startDevScheduler } from '@/lib/scheduler'

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    switch (action) {
      case 'start':
        if (process.env.NODE_ENV === 'development') {
          startDevScheduler()
        } else {
          startRSSScheduler()
        }
        return NextResponse.json({ message: 'RSS scheduler started' })

      case 'stop':
        stopRSSScheduler()
        return NextResponse.json({ message: 'RSS scheduler stopped' })

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use "start" or "stop"' },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Error managing RSS scheduler:', error)
    return NextResponse.json(
      { error: 'Failed to manage RSS scheduler' },
      { status: 500 }
    )
  }
}
