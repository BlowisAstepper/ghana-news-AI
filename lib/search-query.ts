// Common Ghanaian abbreviations often appear expanded in one publisher's
// article and shortened in another. Search both forms without making users
// know which wording the source chose.
const SEARCH_ALIASES: Readonly<Record<string, string>> = {
  afcon: 'Africa Cup of Nations',
  bog: 'Bank of Ghana',
  cagd: 'Controller and Accountant General Department',
  chraj: 'Commission on Human Rights and Administrative Justice',
  cocobod: 'Ghana Cocoa Board',
  dvla: 'Driver and Vehicle Licensing Authority',
  ec: 'Electoral Commission',
  ecg: 'Electricity Company of Ghana',
  ghs: 'Ghana Health Service',
  gnfs: 'Ghana National Fire Service',
  gps: 'Ghana Police Service',
  gra: 'Ghana Revenue Authority',
  ndc: 'National Democratic Congress',
  nhis: 'National Health Insurance Scheme',
  npp: 'New Patriotic Party',
  ssnit: 'Social Security and National Insurance Trust',
}

const MAX_SEARCH_VARIANTS = 8

export function buildSearchVariants(query: string): string[] {
  const variants = new Set<string>([query.replace(/\s+/g, ' ').trim()])

  for (const [abbreviation, expansion] of Object.entries(SEARCH_ALIASES)) {
    const matcher = new RegExp(`\\b${abbreviation}\\b`, 'gi')
    if (!matcher.test(query)) continue

    for (const variant of [...variants]) {
      if (variants.size >= MAX_SEARCH_VARIANTS) break
      // websearch_to_tsquery treats quoted text as an exact phrase. Without
      // quotes, an article containing "Ghana", "revenue", and "authority" in
      // unrelated paragraphs would be a false-positive GRA result.
      variants.add(variant.replace(matcher, `"${expansion}"`))
    }
  }

  return [...variants].filter(Boolean)
}
