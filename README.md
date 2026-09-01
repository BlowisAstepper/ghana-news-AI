# Ghana News Hub

A small, non-commercial Ghanaian news aggregator built with Next.js. It pulls
the latest MyJoyOnline and 3News stories, keeps a rolling 48-hour feed, merges
cross-source coverage of the same event, and offers cached plain-language AI
summaries while always linking readers to the original publishers.

## How it works

```text
GitHub schedule (every 15 minutes)
  -> authenticated /api/rss-fetch
  -> allowlisted RSS/article fetches
  -> clean text + cross-source deduplication
  -> PostgreSQL via Prisma
  -> list/search APIs
  -> responsive Next.js frontend
```

- **Sources:** MyJoyOnline and 3News. Each source has an explicit domain
  allowlist. Feed and article requests have timeouts, redirect limits, response
  size limits, and bounded concurrency.
- **Storage:** Article links are unique. Existing links are refreshed safely;
  newly fetched articles are retained for 48 hours.
- **Duplicate stories:** Gemini compares new headlines with recent canonical
  stories and with earlier articles from the same fetch. Only different-source
  matches are accepted. Failures leave both stories visible rather than risking
  an incorrect merge.
- **Summaries:** Opening a headline generates a 3–4 sentence paraphrase and
  caches it on the article. Database-backed claims stop separate Vercel
  instances from generating the same summary concurrently. Database-backed
  global/client limits protect Gemini quota.
- **Scheduling:** Public article traffic never starts ingestion. Only the
  secret-protected RSS endpoint can refresh the database.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Prisma · PostgreSQL ·
Gemini · Vitest

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/articles` | Paginated canonical stories; optional `source` |
| `GET /api/articles/search` | Title/content search using `q`; optional `source` |
| `POST /api/summarize` | Generate or return a cached article summary |
| `GET/POST /api/rss-fetch` | Secret-protected ingestion trigger |
| `GET /api/health` | Safe configuration, database, and migration readiness check |

Pagination accepts positive integers only, with `limit <= 50`. Search queries
are capped at 200 characters and source names must be one of the configured
publishers.

## Local setup

Node 20.19 or newer is required.

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `MIGRATION_DATABASE_URL` | No | Direct/unpooled migration URL; falls back to `DATABASE_URL` |
| `CRON_SECRET` | Yes | Bearer token protecting `/api/rss-fetch` |
| `GEMINI_API_KEY` | Yes | Duplicate detection and summaries |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical/Open Graph URL |
| `SUMMARY_GLOBAL_RATE_LIMIT_PER_MINUTE` | No | Global summary cap; default `10` |
| `SUMMARY_CLIENT_RATE_LIMIT_PER_MINUTE` | No | Per-client summary cap; default `5` |

Trigger ingestion locally:

```bash
curl -X POST http://localhost:3000/api/rss-fetch \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Quality checks

```bash
npm run lint
npm test
npx tsc --noEmit --incremental false
npm run build
```

CI runs lint, unit tests, a production dependency audit, and a production build
on pull requests and pushes to `main`.

## Vercel deployment

1. Set `DATABASE_URL`, `CRON_SECRET`, `GEMINI_API_KEY`, and
   `NEXT_PUBLIC_SITE_URL` in the Vercel **Production** environment. If your
   provider offers separate pooled and direct URLs, also set the direct URL as
   `MIGRATION_DATABASE_URL`.
2. Deploy from `main`. [`vercel.json`](vercel.json) uses the production build
   script in [`scripts/vercel-build.mjs`](scripts/vercel-build.mjs).
3. A production build runs `prisma migrate deploy` before `next build`, so the
   database schema and generated Prisma Client match the deployed code.
4. Preview/local builds deliberately skip migrations so a pull request cannot
   mutate the production database.
5. Set the GitHub repository variable `APP_URL` to the deployed URL and the
   Actions secret `CRON_SECRET` to the same value used by Vercel.
6. Run the **Refresh RSS feed** workflow once, then verify `/api/health` and
   `/api/articles?page=1&limit=1`.

All migrations in this repository are additive. Keep future migrations
backwards-compatible because they run immediately before a production build.

### Existing database created with `prisma db push`

If the production build reports Prisma `P3005`, the database has tables but no
migration history. Verify that its original `Article` table matches the initial
migration, then baseline only that migration and redeploy:

```bash
npx prisma migrate resolve --applied 20260811024233_init
npx prisma migrate deploy
```

Do not mark later migrations as applied unless their columns/tables actually
exist.

## Troubleshooting

`GET /api/health` returns safe machine-readable status without exposing
secrets. Common database codes in Vercel Function logs are:

- `P2021` / `P2022`: migrations are missing or the schema is outdated.
- `P1001` / `P1012`: `DATABASE_URL` is missing, malformed, or unreachable.
- `P2024`: the connection pool is exhausted; use a pooled serverless database
  URL and review concurrent connections.

The article API converts expected database availability/schema errors into a
clear `503` response while keeping detailed errors in server logs.
