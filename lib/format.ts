// Server-side truncation applied before article content leaves the API.
// The DB keeps the full extracted article text (needed for AI
// summarization), but the public API only ever exposes a short excerpt —
// full-text scraped content shouldn't just sit in a public JSON endpoint
// for anyone to pull out, both as a courtesy to the original publishers and
// to keep this a genuine aggregator rather than a mirror.
export function truncateForApi(content: string, maxLength = 500): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength).trim() + '...'
}
