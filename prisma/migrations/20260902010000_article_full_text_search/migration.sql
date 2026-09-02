-- Rank headline matches above saved summaries and full publisher text. The
-- English text-search configuration also stems word forms such as death/deaths.
CREATE INDEX IF NOT EXISTS "Article_search_document_idx"
ON "Article"
USING GIN ((
  setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english'::regconfig, coalesce("summary", '')), 'B') ||
  setweight(to_tsvector('english'::regconfig, coalesce("content", '')), 'C') ||
  setweight(to_tsvector('english'::regconfig, coalesce("source", '')), 'D')
))
WHERE "mergedIntoId" IS NULL;
