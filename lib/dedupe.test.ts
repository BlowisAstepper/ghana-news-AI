import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createInteraction: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: { article: { findMany: mocks.findMany } },
}))

vi.mock('./gemini', () => ({
  createInteraction: mocks.createInteraction,
}))

import { findDuplicatesForBatch } from './dedupe'

describe('findDuplicatesForBatch', () => {
  beforeEach(() => {
    mocks.findMany.mockReset()
    mocks.createInteraction.mockReset()
    mocks.findMany.mockResolvedValue([])
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('merges different-source stories introduced in the same fetch', async () => {
    mocks.createInteraction.mockResolvedValue('N1: none\nN2: N1')

    const result = await findDuplicatesForBatch([
      { title: 'Budget statement presented to Parliament', source: 'MyJoyOnline' },
      { title: 'Government presents new budget in Parliament', source: '3News' },
    ])

    expect(result.get(1)).toEqual({ kind: 'batch', articleIndex: 0 })
  })

  it('rejects same-source matches even when the model proposes one', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'existing-1', title: 'Existing story', source: 'MyJoyOnline' },
    ])
    mocks.createInteraction.mockResolvedValue('N1: E1\nN2: E1')

    const result = await findDuplicatesForBatch([
      { title: 'Same outlet update', source: 'MyJoyOnline' },
      { title: 'Other outlet coverage', source: '3News' },
    ])

    expect(result.has(0)).toBe(false)
    expect(result.get(1)).toEqual({ kind: 'existing', articleId: 'existing-1' })
  })

  it('checks inputs beyond the prompt-size boundary instead of skipping them', async () => {
    const articles = Array.from({ length: 61 }, (_, index) => ({
      title: `Story ${index + 1}`,
      source: index % 2 === 0 ? 'MyJoyOnline' : '3News',
    }))
    mocks.createInteraction
      .mockResolvedValueOnce(
        Array.from({ length: 60 }, (_, index) => `N${index + 1}: none`).join('\n')
      )
      .mockResolvedValueOnce('N61: N60')

    const result = await findDuplicatesForBatch(articles)

    expect(mocks.createInteraction).toHaveBeenCalledTimes(2)
    expect(result.get(60)).toEqual({ kind: 'batch', articleIndex: 59 })
  })

  it('fails open when Gemini is unavailable', async () => {
    mocks.createInteraction.mockRejectedValue(new Error('quota unavailable'))

    await expect(
      findDuplicatesForBatch([
        { title: 'A story remains visible', source: 'MyJoyOnline' },
      ])
    ).resolves.toEqual(new Map())
  })
})
