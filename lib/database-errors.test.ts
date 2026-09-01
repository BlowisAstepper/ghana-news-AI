import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { toPublicDatabaseError } from './database-errors'

function knownPrismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('database error', {
    code,
    clientVersion: '5.22.0',
  })
}

describe('toPublicDatabaseError', () => {
  it.each(['P2021', 'P2022'])('identifies outdated schemas for %s', (code) => {
    expect(toPublicDatabaseError(knownPrismaError(code))).toMatchObject({
      status: 503,
      code: 'DATABASE_SCHEMA_OUTDATED',
    })
  })

  it('identifies connection-pool exhaustion', () => {
    expect(toPublicDatabaseError(knownPrismaError('P2024'))).toMatchObject({
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
    })
  })

  it('uses the endpoint-specific fallback for unrelated errors', () => {
    expect(toPublicDatabaseError(new Error('hidden detail'), 'Summary failed')).toEqual({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Summary failed',
    })
  })
})
