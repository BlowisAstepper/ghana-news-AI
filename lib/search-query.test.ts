import { describe, expect, it } from 'vitest'
import { buildSearchVariants } from './search-query'

describe('buildSearchVariants', () => {
  it('adds the expanded form of a Ghanaian abbreviation', () => {
    expect(buildSearchVariants('GRA')).toEqual([
      'GRA',
      '"Ghana Revenue Authority"',
    ])
  })

  it('preserves surrounding search terms in expanded variants', () => {
    expect(buildSearchVariants('GRA tax collection')).toEqual([
      'GRA tax collection',
      '"Ghana Revenue Authority" tax collection',
    ])
  })

  it('expands multiple abbreviations without producing unbounded variants', () => {
    expect(buildSearchVariants('NPP questions GRA')).toEqual([
      'NPP questions GRA',
      'NPP questions "Ghana Revenue Authority"',
      '"New Patriotic Party" questions GRA',
      '"New Patriotic Party" questions "Ghana Revenue Authority"',
    ])
  })

  it('leaves ordinary words for PostgreSQL stemming', () => {
    expect(buildSearchVariants('  deaths   registration ')).toEqual([
      'deaths registration',
    ])
  })
})
