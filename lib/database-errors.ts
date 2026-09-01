import { Prisma } from '@prisma/client'

export type PublicDatabaseError = {
  status: 500 | 503
  code: 'DATABASE_SCHEMA_OUTDATED' | 'DATABASE_UNAVAILABLE' | 'INTERNAL_ERROR'
  message: string
}

export function toPublicDatabaseError(
  error: unknown,
  fallbackMessage = 'Failed to fetch articles'
): PublicDatabaseError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2021' || error.code === 'P2022') {
      return {
        status: 503,
        code: 'DATABASE_SCHEMA_OUTDATED',
        message: 'The news database is being updated. Please try again shortly.',
      }
    }

    if (error.code === 'P2024') {
      return {
        status: 503,
        code: 'DATABASE_UNAVAILABLE',
        message: 'The news database is temporarily busy. Please try again shortly.',
      }
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'The news database is temporarily unavailable. Please try again shortly.',
    }
  }

  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: fallbackMessage,
  }
}
