import { describe, expect, it } from 'vitest'
import {
  GEMINI_FALLBACK_MODEL,
  GEMINI_MODEL,
  isGeminiRateLimitError,
} from './gemini'

describe('Gemini model selection', () => {
  it('uses a high-throughput primary model and a distinct fallback', () => {
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite')
    expect(GEMINI_FALLBACK_MODEL).toBe('gemini-3.6-flash')
    expect(GEMINI_FALLBACK_MODEL).not.toBe(GEMINI_MODEL)
  })

  it('recognizes both SDK rate-limit status shapes', () => {
    expect(isGeminiRateLimitError({ status: 429 })).toBe(true)
    expect(isGeminiRateLimitError({ statusCode: 429 })).toBe(true)
    expect(isGeminiRateLimitError({ status: 503 })).toBe(false)
    expect(isGeminiRateLimitError(new Error('429'))).toBe(false)
  })
})
