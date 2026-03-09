import cron, { ScheduledTask } from 'node-cron'
import { fetchAndStoreArticles } from './rss-service'

let isRunning = false
let scheduledTask: ScheduledTask | null = null

export async function startRSSScheduler() {
  if (isRunning) {
    console.log('RSS scheduler is already running')
    return
  }

  isRunning = true
  console.log('Starting RSS scheduler - will fetch articles every 15 minutes using node-cron')

  // Initial fetch
  try {
    console.log('Performing initial RSS fetch...')
    const result = await fetchAndStoreArticles()
    console.log(`Initial fetch completed: ${result.success} articles stored, ${result.failed} failed, ${result.deleted} deleted`)
  } catch (error) {
    console.error('Error during initial RSS fetch:', error)
  }

  // Schedule frequent fetches to keep news fresh using node-cron (every 15 minutes)
  scheduledTask = cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('Performing scheduled RSS fetch...')
      const result = await fetchAndStoreArticles()
      console.log(`Scheduled fetch completed: ${result.success} articles stored, ${result.failed} failed, ${result.deleted} deleted`)
    } catch (error) {
      console.error('Error during scheduled RSS fetch:', error)
    }
  })

  console.log('RSS scheduler started with node-cron')

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('Stopping RSS scheduler...')
    if (scheduledTask) scheduledTask.stop()
    isRunning = false
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('Stopping RSS scheduler...')
    if (scheduledTask) scheduledTask.stop()
    isRunning = false
    process.exit(0)
  })
}

export function stopRSSScheduler() {
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
  }
  isRunning = false
  console.log('RSS scheduler stopped')
}

export function startDevScheduler() {
  // In development, just run immediately and every 5 minutes
  startRSSScheduler()
}

export function isSchedulerRunning(): boolean {
  return isRunning
}

