import { createHash, timingSafeEqual } from 'node:crypto'
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from 'jose'

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
const GITHUB_OIDC_AUDIENCES = [
  'https://ghana-news-ai-wheat.vercel.app/api/rss-fetch',
  'https://ghnewshub.vercel.app/api/rss-fetch',
] as const
const GITHUB_REPOSITORY = 'BlowisAstepper/ghana-news-AI'
const GITHUB_REPOSITORY_ID = '1176713046'
const GITHUB_WORKFLOW_REF =
  'BlowisAstepper/ghana-news-AI/.github/workflows/rss-fetch.yml@refs/heads/main'
const MAIN_REF = 'refs/heads/main'
const MAX_BEARER_TOKEN_LENGTH = 8192

const githubJwks = createRemoteJWKSet(
  new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`),
  {
    timeoutDuration: 5_000,
    cooldownDuration: 30_000,
  }
)

type VerifyGitHubToken = (token: string) => Promise<boolean>
type JwtVerificationKey = Parameters<typeof jwtVerify>[1]

interface AuthorizationOptions {
  cronSecret?: string
  verifyGitHubToken?: VerifyGitHubToken
}

/**
 * Authorize either the existing shared Vercel cron secret or a short-lived,
 * signed GitHub Actions identity token. Supporting both keeps manual/Vercel
 * cron calls working while avoiding a second shared secret that can drift out
 * of sync in GitHub repository settings.
 */
export async function isRssFetchAuthorized(
  authorization: string | null,
  options: AuthorizationOptions = {}
): Promise<boolean> {
  const token = parseBearerToken(authorization)
  if (!token) return false

  const cronSecret = options.cronSecret ?? process.env.CRON_SECRET
  if (cronSecret && secretsMatch(token, cronSecret)) return true

  const verifyGitHubToken =
    options.verifyGitHubToken ?? verifyGitHubActionsToken
  return verifyGitHubToken(token)
}

export function hasTrustedGitHubActionsClaims(payload: JWTPayload): boolean {
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  const hasApprovedAudience = audience.some(
    (value) =>
      typeof value === 'string' &&
      GITHUB_OIDC_AUDIENCES.includes(
        value as (typeof GITHUB_OIDC_AUDIENCES)[number]
      )
  )

  return (
    payload.iss === GITHUB_OIDC_ISSUER &&
    hasApprovedAudience &&
    payload.repository === GITHUB_REPOSITORY &&
    payload.repository_id === GITHUB_REPOSITORY_ID &&
    payload.ref === MAIN_REF &&
    payload.workflow_ref === GITHUB_WORKFLOW_REF &&
    (payload.event_name === 'schedule' ||
      payload.event_name === 'workflow_dispatch')
  )
}

export async function verifyGitHubActionsToken(
  token: string,
  verificationKey: JwtVerificationKey = githubJwks
): Promise<boolean> {
  try {
    // Reject unrelated JWTs before consulting the remote key set. These
    // decoded claims are not trusted until jwtVerify succeeds; the same exact
    // checks are repeated against the cryptographically verified payload.
    const unverifiedPayload = decodeJwt(token)
    if (!hasTrustedGitHubActionsClaims(unverifiedPayload)) return false

    const { payload } = await jwtVerify(token, verificationKey, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: [...GITHUB_OIDC_AUDIENCES],
      algorithms: ['RS256'],
      typ: 'JWT',
      requiredClaims: [
        'sub',
        'exp',
        'iat',
        'nbf',
        'jti',
        'repository',
        'repository_id',
        'ref',
        'workflow_ref',
        'event_name',
      ],
      maxTokenAge: '5 minutes',
      clockTolerance: 10,
    })

    return hasTrustedGitHubActionsClaims(payload)
  } catch {
    return false
  }
}

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null

  const token = authorization.slice('Bearer '.length).trim()
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) return null
  return token
}

function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}
