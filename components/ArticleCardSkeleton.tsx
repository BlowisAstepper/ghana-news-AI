// Mirrors ArticleCard's layout so the grid doesn't jump when real content
// arrives — same accent bar, badge, title lines, and body lines, just pulsing
// gray blocks instead of content.
export default function ArticleCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 animate-pulse">
      <div className="h-1 w-full bg-gray-200 dark:bg-gray-800" />
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="h-5 w-20 rounded-full bg-gray-200 dark:bg-gray-800" />
          <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="space-y-2 mb-4">
          <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-800" />
          <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="space-y-2 mb-5">
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800/70" />
          <div className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800/70" />
          <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-gray-800/70" />
        </div>
        <div className="h-4 w-28 rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  )
}
