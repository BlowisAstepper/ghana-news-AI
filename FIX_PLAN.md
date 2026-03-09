# Fix Plan

## Issues Fixed:
1. [x] Race condition in rss-service.ts - now uses upsert instead of findUnique + create
2. [x] Added publishedAt field to capture publication date from RSS
3. [x] Added index on source field in Prisma schema for query performance
4. [x] Added automatic cleanup of articles older than 24 hours
5. [x] Removed Graphic source (only MyJoyOnline remains)
6. [x] Updated all UI references to reflect single source
7. [x] Changed scheduler interval from 1 hour to 15 minutes

## Files Edited:
1. [x] prisma/schema.prisma - Added publishedAt + index
2. [x] lib/rss-parser.ts - Captures pubDate
3. [x] lib/rss-service.ts - Uses upsert, handles publishedAt, deletes old articles
4. [x] lib/scheduler.ts - Updated interval to 15 minutes
5. [x] app/layout.tsx - Updated metadata
6. [x] components/SearchBar.tsx - Removed Graphic option
7. [x] app/page.tsx - Updated all references

## Database:
- [x] Deleted all Graphic articles from database
- [x] Generated Prisma client

