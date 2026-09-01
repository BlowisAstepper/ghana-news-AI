export interface PublicAiError {
  status: 429 | 502 | 503 | 504
  code:
    | 'AI_RATE_LIMITED'
    | 'AI_UPSTREAM_ERROR'
    | 'AI_UNAVAILABLE'
    | 'AI_TIMEOUT'
  message: string
  retryAfterSeconds?: number
}

export function toPublicAiError(error: unknown): PublicAiError | null {
  const details = error as {
    name?: unknown
    status?: unknown
    statusCode?: unknown
    message?: unknown
  }
  const name = typeof details?.name === 'string' ? details.name : ''
  const status =
    typeof details?.status === 'number'
      ? details.status
      : typeof details?.statusCode === 'number'
        ? details.statusCode
        : null
  const message = typeof details?.message === 'string' ? details.message : ''

  if (status === 429) {
    return {
      status: 429,
      code: 'AI_RATE_LIMITED',
      message: 'The AI summary service is busy. Please try again shortly.',
      retryAfterSeconds: 30,
    }
  }

  if (
    status === 408 ||
    name === 'APIConnectionTimeoutError' ||
    message.startsWith('Request timed out:')
  ) {
    return {
      status: 504,
      code: 'AI_TIMEOUT',
      message: 'The AI summary took too long. Please try this article again.',
      retryAfterSeconds: 5,
    }
  }

  if (
    status === 401 ||
    status === 403 ||
    message === 'GEMINI_API_KEY is not configured'
  ) {
    return {
      status: 503,
      code: 'AI_UNAVAILABLE',
      message: 'The AI summary service is temporarily unavailable.',
    }
  }

  if ((status !== null && status >= 400) || name === 'APIConnectionError') {
    return {
      status: 502,
      code: 'AI_UPSTREAM_ERROR',
      message: 'The AI summary service returned an error. Please try again.',
      retryAfterSeconds: 5,
    }
  }

  return null
}
