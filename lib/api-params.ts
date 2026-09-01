const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 12
const MAX_SEARCH_LENGTH = 200
const ALLOWED_SOURCES = new Set(['MyJoyOnline', '3News'])

// OFFSET pagination gets progressively more expensive as the requested page
// grows. These bounds also keep untrusted query values within Prisma's safe
// integer range and prevent a single request from asking the database to
// materialize an unbounded result set.
export const MAX_PAGE = 10_000
export const MAX_LIMIT = 50

export type PaginationParams = {
  page: number
  limit: number
}

export type PaginationParseResult =
  | { ok: true; value: PaginationParams }
  | { ok: false; error: string }

export type StringParseResult =
  | { ok: true; value: string }
  | { ok: false; error: string }

function parsePositiveInteger(
  rawValue: string | null,
  fallback: number,
  name: 'page' | 'limit',
  maximum: number
): { ok: true; value: number } | { ok: false; error: string } {
  // Keep an empty query parameter backwards-compatible with the previous
  // `value || default` behaviour.
  if (rawValue === null || rawValue === '') {
    return { ok: true, value: fallback }
  }

  // Number()/parseInt() both accept surprising values such as `1e3`, `1.5`
  // or `12junk`. API pagination only accepts ordinary base-10 integers.
  if (!/^\d+$/.test(rawValue)) {
    return {
      ok: false,
      error: `${name} must be a whole number between 1 and ${maximum}`,
    }
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    return {
      ok: false,
      error: `${name} must be a whole number between 1 and ${maximum}`,
    }
  }

  return { ok: true, value }
}

export function parsePagination(searchParams: URLSearchParams): PaginationParseResult {
  const page = parsePositiveInteger(
    searchParams.get('page'),
    DEFAULT_PAGE,
    'page',
    MAX_PAGE
  )
  if (!page.ok) return page

  const limit = parsePositiveInteger(
    searchParams.get('limit'),
    DEFAULT_LIMIT,
    'limit',
    MAX_LIMIT
  )
  if (!limit.ok) return limit

  return {
    ok: true,
    value: { page: page.value, limit: limit.value },
  }
}

export function parseSource(rawValue: string | null): StringParseResult {
  if (rawValue === null || rawValue === '') return { ok: true, value: '' }
  if (!ALLOWED_SOURCES.has(rawValue)) {
    return { ok: false, error: 'source must be MyJoyOnline or 3News' }
  }
  return { ok: true, value: rawValue }
}

export function parseSearchQuery(rawValue: string | null): StringParseResult {
  const value = (rawValue ?? '').trim()
  if (value.length > MAX_SEARCH_LENGTH) {
    return {
      ok: false,
      error: `q must be ${MAX_SEARCH_LENGTH} characters or fewer`,
    }
  }
  return { ok: true, value }
}
