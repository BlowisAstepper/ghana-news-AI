import Link from 'next/link'
import { Article } from '@/types/article'

interface ArticleCardProps {
  article: Article
  onOpenSummary: (article: Article) => void
}

export default function ArticleCard({ article, onOpenSummary }: ArticleCardProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const truncateContent = (content: string, maxLength = 150) => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength).trim() + '...'
  }

  const getSourceStyle = (source: string) => {
    switch (source.toLowerCase()) {
      case 'myjoyonline':
        return {
          badge: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
          accent: 'from-red-500 to-red-600',
        }
      case '3news':
        return {
          badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
          accent: 'from-amber-500 to-amber-600',
        }
      default:
        return {
          badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
          accent: 'from-gray-400 to-gray-500',
        }
    }
  }

  const displayDate = article.publishedAt ?? article.createdAt
  const { badge, accent } = getSourceStyle(article.source)

  return (
    <article className="group relative bg-white dark:bg-gray-900 rounded-2xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out overflow-hidden border border-gray-200 dark:border-gray-800">
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />

      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge}`}>
              {article.source}
            </span>
            {article.duplicates && article.duplicates.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                +{article.duplicates.length} more
              </span>
            )}
          </div>
          <time className="text-xs text-gray-400 dark:text-gray-500">
            {formatDate(displayDate)}
          </time>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 line-clamp-2 leading-snug">
          <button
            type="button"
            onClick={() => onOpenSummary(article)}
            className="text-left hover:text-red-600 dark:hover:text-red-400 transition-colors duration-200"
          >
            {article.title}
          </button>
        </h2>

        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-4 line-clamp-3">
          {truncateContent(article.content)}
        </p>

        <Link
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="group/link inline-flex items-center text-sm font-medium text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300 transition-colors duration-200"
        >
          Read full article
          <svg
            className="ml-1 w-4 h-4 transition-transform duration-200 group-hover/link:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </Link>
      </div>
    </article>
  )
}
