import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFullArticleContent } from './article-extractor'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchFullArticleContent', () => {
  it('extracts the article body while excluding navigation and related content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(`
          <html><body>
            <nav>Site navigation</nav>
            <article>
              <h1>Headline</h1>
              <div class="article-content">
                <p>The first paragraph contains the main facts.</p>
                <p>The second paragraph explains what happened next.</p>
              </div>
              <aside class="related-posts">Unrelated headline</aside>
            </article>
          </body></html>
        `)
      )
    )

    await expect(
      fetchFullArticleContent('https://www.myjoyonline.com/story', [
        'myjoyonline.com',
      ])
    ).resolves.toBe(
      'The first paragraph contains the main facts. The second paragraph explains what happened next.'
    )
  })
})
