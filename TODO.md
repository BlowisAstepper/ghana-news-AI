# Current follow-up work

The production-readiness repair is complete in code. Remaining improvements are
product enhancements rather than blockers:

- Add browser-level end-to-end tests backed by an isolated test database.
- Add date-range and category filters if the product needs them.
- Add production uptime alerts against `/api/health` and the RSS workflow.
- Configure a separate Vercel Preview database before enabling database-backed
  preview integration tests.
