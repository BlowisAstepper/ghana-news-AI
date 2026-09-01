import { describe, expect, it } from 'vitest'
import {
  MAX_LIMIT,
  MAX_PAGE,
  parsePagination,
  parseSearchQuery,
  parseSource,
} from './api-params'

describe('parsePagination', () => {
  it('uses the public API defaults', () => {
    expect(parsePagination(new URLSearchParams())).toEqual({
      ok: true,
      value: { page: 1, limit: 12 },
    })
  })

  it.each(['0', '-1', '1.5', '1e3', '12junk'])('rejects an invalid page value: %s', (page) => {
    expect(parsePagination(new URLSearchParams({ page })).ok).toBe(false)
  })

  it('rejects values above the resource bounds', () => {
    expect(
      parsePagination(new URLSearchParams({ page: String(MAX_PAGE + 1) })).ok
    ).toBe(false)
    expect(
      parsePagination(new URLSearchParams({ limit: String(MAX_LIMIT + 1) })).ok
    ).toBe(false)
  })
})

describe('article filter parsing', () => {
  it.each(['MyJoyOnline', '3News'])('accepts the configured source %s', (source) => {
    expect(parseSource(source)).toEqual({ ok: true, value: source })
  })

  it('rejects unknown sources', () => {
    expect(parseSource('Unknown').ok).toBe(false)
  })

  it('trims search queries and limits their size', () => {
    expect(parseSearchQuery('  elections  ')).toEqual({
      ok: true,
      value: 'elections',
    })
    expect(parseSearchQuery('x'.repeat(201)).ok).toBe(false)
  })
})
