import { describe, expect, it } from 'vitest'
import { toPublicAiError } from './ai-errors'

describe('toPublicAiError', () => {
  it('maps SDK timeouts to a retryable gateway timeout', () => {
    expect(
      toPublicAiError({
        name: 'APIConnectionTimeoutError',
        message: 'Request timed out: TimeoutError',
      })
    ).toEqual({
      status: 504,
      code: 'AI_TIMEOUT',
      message: 'The AI summary took too long. Please try this article again.',
      retryAfterSeconds: 5,
    })
  })

  it('maps quota, credential, and upstream failures without exposing details', () => {
    expect(toPublicAiError({ status: 429 })?.code).toBe('AI_RATE_LIMITED')
    expect(toPublicAiError({ status: 403 })?.code).toBe('AI_UNAVAILABLE')
    expect(toPublicAiError({ statusCode: 500 })?.code).toBe('AI_UPSTREAM_ERROR')
  })

  it('leaves unrelated errors for database/internal classification', () => {
    expect(toPublicAiError(new Error('unrelated failure'))).toBeNull()
  })
})
