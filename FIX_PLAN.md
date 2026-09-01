# Production repair record

## Root cause addressed

The deployed article API used `summary`, `mergedIntoId`, and duplicate-relation
fields introduced by later Prisma migrations, while Vercel only generated the
Prisma Client and never deployed those migrations. An older production schema
therefore returned a server error as soon as `/api/articles` queried it.

Production Vercel builds now run `prisma migrate deploy` before `next build`.
Preview builds explicitly skip database migrations.

The first post-repair refresh exposed a second production constraint: both
publishers returned 50 entries and ingestion tried to extract many full pages
before writing any rows, exceeding the serverless invocation budget. Scheduled
ingestion now imports the latest 20 RSS entries per source in about a second,
uses bulk/bounded-concurrency database work, and time-bounds optional AI dedupe.
Full-page extraction happens only when one reader requests one thin summary.

## Reliability and security work

- Added `/api/health` and stable public database error codes.
- Validated and capped pagination, search, and source parameters.
- Removed traffic-triggered RSS ingestion; the authenticated scheduler is the
  only refresh mechanism.
- Replaced drift-prone GitHub/Vercel shared scheduler configuration with a
  short-lived GitHub OIDC identity restricted to this repository, workflow,
  and `main` branch. The existing shared-secret path remains available for
  manual or Vercel cron calls.
- Added publisher allowlists, redirect validation, request timeouts, response
  limits, and bounded feed imports.
- Fixed same-fetch cross-source deduplication and model-output validation.
- Added distributed summary-generation claims and global/client rate limits.
- Hardened AI prompts against instructions embedded in source material.
- Added frontend request cancellation, accurate refresh/loading behavior, and
  accessible modal focus management.
- Updated Next.js and transitive dependencies to patched versions.
- Added Vitest regression coverage and CI test execution.

See `README.md` for deployment and one-time production recovery instructions.
