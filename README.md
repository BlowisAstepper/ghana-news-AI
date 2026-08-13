# Ghana News Hub

A news aggregator that pulls MyJoyOnline's RSS feed, cleans and dedupes the
articles, and serves them through a searchable Next.js frontend.

## How it works

- **Ingestion** (`lib/rss-parser.ts`, `lib/rss-service.ts`): parses the RSS
  feed, falls back to fetching and extracting the full article with
  `@mozilla/readability` when the feed entry is too thin, strips markup with
  `cheerio`, and `upsert`s into Postgres keyed on the article link (so
  re-fetching never creates duplicates, even under concurrent runs).
- **Retention**: articles older than 24 hours are pruned on every fetch, so
  the feed stays current instead of growing forever.
- **Scheduling**: there's no in-process cron. Serverless functions (Vercel,
  in this case) don't have a long-running process to host one, so a `GET/POST
  /api/rss-fetch` route does the fetch, and something external calls it on a
  timer — see [`.github/workflows/rss-fetch.yml`](.github/workflows/rss-fetch.yml).
  That route requires `Authorization: Bearer $CRON_SECRET`; without a
  `CRON_SECRET` set it refuses every request, including its own trigger.
- **API**: `GET /api/articles` (paginated, optional `source` filter) and
  `GET /api/articles/search` (`q` + optional `source`) back the frontend.
  There is deliberately no public write endpoint — articles only enter
  through the ingestion pipeline.
- **Summaries**: tapping an article title opens a modal with a short,
  plain-language AI paraphrase instead of navigating straight to the source
  (see `components/SummaryModal.tsx`). `POST /api/summarize` generates it via
  the free Gemini API (`lib/summarize.ts`) and caches the result in
  `Article.summary` — each article is summarized at most once, ever, no
  matter how many times it's opened.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Prisma · Postgres · Gemini API

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, CRON_SECRET, GEMINI_API_KEY
npx prisma migrate dev --name init
npm run dev
```

A free [Neon](https://neon.tech) Postgres database works fine for
`DATABASE_URL`, both locally and in production. Generate `CRON_SECRET` with
`openssl rand -base64 32`. Get a free `GEMINI_API_KEY` at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no
billing required for the free tier.

To trigger a fetch manually instead of waiting on the schedule:

```bash
curl -X POST http://localhost:3000/api/rss-fetch \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Deploying (free)

1. **Database** — create a free Postgres instance on
   [Neon](https://neon.tech), copy its connection string.
2. **Vercel** — import the repo, set `DATABASE_URL`, `CRON_SECRET`, and
   `GEMINI_API_KEY` as project environment variables, deploy. Add
   `NEXT_PUBLIC_SITE_URL` once you know the deployed domain (used for Open
   Graph tags).
3. **Migrate** — run `npx prisma migrate deploy` against the Neon URL (once,
   from your machine or a one-off CI step) to create the `Article` table.
4. **Scheduler** — in the GitHub repo, add two Actions secrets/vars:
   `CRON_SECRET` (same value as on Vercel) and a repo variable `APP_URL` set
   to the deployed URL (no trailing slash). The
   [`rss-fetch` workflow](.github/workflows/rss-fetch.yml) then pings
   `/api/rss-fetch` every 15 minutes. GitHub disables schedules on repos with
   no commits for 60 days — a small nudge (any commit) reactivates it.

## Project layout

```
app/
  api/articles/          GET list + search
  api/rss-fetch/          fetch-and-store, auth-gated, meant for the scheduler
  api/summarize/           on-demand AI summary, cached in the DB
  page.tsx                 the frontend
components/               ArticleCard, ArticleList, SearchBar, SummaryModal
lib/                      rss-parser, rss-service, prisma client, gemini client, summarize
prisma/schema.prisma      Article model
```
