const MAX_REDIRECTS = 3

export interface PublisherFetchOptions {
  allowedDomains: readonly string[]
  timeoutMs: number
  maxBytes: number
  accept: string
}

export function validatePublisherUrl(
  rawUrl: string,
  allowedDomains: readonly string[],
  baseUrl?: string
): string {
  let url: URL
  try {
    url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl)
  } catch {
    throw new Error('Invalid publisher URL')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error('Publisher URLs cannot contain credentials')
  }
  if (
    url.port &&
    !((url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80'))
  ) {
    throw new Error('Publisher URLs cannot use a non-standard port')
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const isAllowed = allowedDomains.some((rawDomain) => {
    const domain = rawDomain.toLowerCase().replace(/^\./, '').replace(/\.$/, '')
    return hostname === domain || hostname.endsWith(`.${domain}`)
  })

  if (!isAllowed) {
    throw new Error(`Publisher host is not allowed: ${hostname}`)
  }

  url.hostname = hostname
  url.hash = ''
  return url.toString()
}

export async function fetchPublisherText(
  url: string,
  options: PublisherFetchOptions
): Promise<string> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)

  try {
    let currentUrl = validatePublisherUrl(url, options.allowedDomains)

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const response = await fetch(currentUrl, {
        cache: 'no-store',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: options.accept,
          'User-Agent': 'Mozilla/5.0 (compatible; GhanaNewsBot/1.0)',
        },
      })

      if (isRedirect(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()

        if (!location) throw new Error(`HTTP ${response.status} redirect had no location`)
        if (redirectCount === MAX_REDIRECTS) {
          throw new Error(`Too many redirects (maximum ${MAX_REDIRECTS})`)
        }

        currentUrl = validatePublisherUrl(location, options.allowedDomains, currentUrl)
        continue
      }

      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`HTTP ${response.status}`)
      }

      return await readLimitedText(response, options.maxBytes)
    }

    throw new Error('Unable to fetch publisher URL')
  } catch (error) {
    if (timedOut) {
      throw new Error(`Request timed out after ${options.timeoutMs}ms`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength)
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      await response.body?.cancel()
      throw new Error(`Response exceeded the ${maxBytes}-byte limit`)
    }
  }

  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    bytesRead += value.byteLength
    if (bytesRead > maxBytes) {
      await reader.cancel()
      throw new Error(`Response exceeded the ${maxBytes}-byte limit`)
    }

    text += decoder.decode(value, { stream: true })
  }

  return text + decoder.decode()
}
