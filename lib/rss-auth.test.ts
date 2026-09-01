import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  hasTrustedGitHubActionsClaims,
  isRssFetchAuthorized,
  verifyGitHubActionsToken,
} from './rss-auth'

const trustedClaims = {
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'https://ghana-news-ai-wheat.vercel.app/api/rss-fetch',
  repository: 'BlowisAstepper/ghana-news-AI',
  repository_id: '1176713046',
  ref: 'refs/heads/main',
  workflow_ref:
    'BlowisAstepper/ghana-news-AI/.github/workflows/rss-fetch.yml@refs/heads/main',
  event_name: 'schedule',
}

let trustedPrivateKey: CryptoKey
let trustedKeySet: ReturnType<typeof createLocalJWKSet>
let untrustedKeySet: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const trustedKeys = await generateKeyPair('RS256', { extractable: true })
  const untrustedKeys = await generateKeyPair('RS256', { extractable: true })
  trustedPrivateKey = trustedKeys.privateKey

  const trustedJwk = await exportJWK(trustedKeys.publicKey)
  const untrustedJwk = await exportJWK(untrustedKeys.publicKey)
  trustedKeySet = createLocalJWKSet({
    keys: [{ ...trustedJwk, alg: 'RS256', kid: 'test-key', use: 'sig' }],
  })
  untrustedKeySet = createLocalJWKSet({
    keys: [{ ...untrustedJwk, alg: 'RS256', kid: 'test-key', use: 'sig' }],
  })
})

async function createSignedToken(
  claims: Partial<JWTPayload> = {},
  options: { includeNotBefore?: boolean; expirationTime?: number } = {}
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  let token = new SignJWT({ ...trustedClaims, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
    .setSubject('repo:BlowisAstepper/ghana-news-AI:ref:refs/heads/main')
    .setIssuedAt(now)
    .setExpirationTime(options.expirationTime ?? now + 300)
    .setJti('test-token-id')

  if (options.includeNotBefore !== false) token = token.setNotBefore(now - 5)
  return token.sign(trustedPrivateKey)
}

describe('RSS fetch authorization', () => {
  it('accepts the configured cron secret without invoking OIDC verification', async () => {
    const verifyGitHubToken = vi.fn(async () => false)

    await expect(
      isRssFetchAuthorized('Bearer local-secret', {
        cronSecret: 'local-secret',
        verifyGitHubToken,
      })
    ).resolves.toBe(true)
    expect(verifyGitHubToken).not.toHaveBeenCalled()
  })

  it('rejects malformed and near-match bearer credentials', async () => {
    const verifyGitHubToken = vi.fn(async () => false)

    await expect(
      isRssFetchAuthorized('Basic local-secret', {
        cronSecret: 'local-secret',
        verifyGitHubToken,
      })
    ).resolves.toBe(false)
    await expect(
      isRssFetchAuthorized('Bearer local-secret!', {
        cronSecret: 'local-secret',
        verifyGitHubToken,
      })
    ).resolves.toBe(false)
  })

  it('falls back to a verified GitHub Actions token', async () => {
    const verifyGitHubToken = vi.fn(async () => true)

    await expect(
      isRssFetchAuthorized('Bearer signed-github-token', {
        cronSecret: 'different-secret',
        verifyGitHubToken,
      })
    ).resolves.toBe(true)
    expect(verifyGitHubToken).toHaveBeenCalledWith('signed-github-token')
  })
})

describe('trusted GitHub Actions claims', () => {
  it('accepts scheduled and manual runs of the exact main-branch workflow', () => {
    expect(hasTrustedGitHubActionsClaims(trustedClaims)).toBe(true)
    expect(
      hasTrustedGitHubActionsClaims({
        ...trustedClaims,
        event_name: 'workflow_dispatch',
      })
    ).toBe(true)
  })

  it('accepts the new production audience during the domain transition', () => {
    expect(
      hasTrustedGitHubActionsClaims({
        ...trustedClaims,
        aud: 'https://ghnewshub.vercel.app/api/rss-fetch',
      })
    ).toBe(true)
  })

  it.each([
    ['repository', 'someone/fork'],
    ['repository_id', '999'],
    ['ref', 'refs/heads/feature'],
    [
      'workflow_ref',
      'BlowisAstepper/ghana-news-AI/.github/workflows/ci.yml@refs/heads/main',
    ],
    ['event_name', 'pull_request'],
    ['aud', 'https://example.com/api/rss-fetch'],
    ['iss', 'https://example.com'],
  ])('rejects an unexpected %s claim', (claim, value) => {
    expect(
      hasTrustedGitHubActionsClaims({ ...trustedClaims, [claim]: value })
    ).toBe(false)
  })
})

describe('GitHub Actions token verification', () => {
  it('verifies the signature, registered claims, and trusted workflow claims', async () => {
    const token = await createSignedToken()
    await expect(
      verifyGitHubActionsToken(token, trustedKeySet)
    ).resolves.toBe(true)
  })

  it('rejects a token signed by an untrusted key', async () => {
    const token = await createSignedToken()
    await expect(
      verifyGitHubActionsToken(token, untrustedKeySet)
    ).resolves.toBe(false)
  })

  it('rejects expired, incomplete, and incorrectly scoped signed tokens', async () => {
    const now = Math.floor(Date.now() / 1000)
    const expired = await createSignedToken(
      {},
      { expirationTime: now - 30 }
    )
    const wrongAudience = await createSignedToken({
      aud: 'https://example.com/api/rss-fetch',
    })
    const wrongRepository = await createSignedToken({ repository_id: '999' })
    const missingNotBefore = await createSignedToken(
      {},
      { includeNotBefore: false }
    )

    await expect(
      verifyGitHubActionsToken(expired, trustedKeySet)
    ).resolves.toBe(false)
    await expect(
      verifyGitHubActionsToken(wrongAudience, trustedKeySet)
    ).resolves.toBe(false)
    await expect(
      verifyGitHubActionsToken(wrongRepository, trustedKeySet)
    ).resolves.toBe(false)
    await expect(
      verifyGitHubActionsToken(missingNotBefore, trustedKeySet)
    ).resolves.toBe(false)
  })
})
