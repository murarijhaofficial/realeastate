# Repository guidance

This repository contains a TypeScript Express/PostgreSQL CRM and local WordPress plugin repair copies. `agent.md` is the existing project history; do not overwrite it. Existing uncommitted work must be preserved.

## Website lead integration

Read `LEAD_SYNC_AUDIT.md` and `IMPLEMENTATION_PROGRESS.md` before changing this integration. The plugin copies under `plugin-repair/` are not evidence of the versions installed on the live site. Obtain and compare the actual active plugin and form-handler sources before preparing replacement packages. Never deploy or modify production records without an approved deployment procedure and backup.

The local CRM implementation at `backend/src/app.ts` implements `POST /api/v1/integrations/website-leads`; its schema and aliases are in `backend/src/validation.ts` and `backend/src/lead-mapping.ts`. A project-scoped, active `ed_live_` website integration key is sent as `Authorization: Bearer <key>`. `X-EstateDesk-Format: canonical` bypasses per-key input mappings. The key routes the lead to its associated active project. Require explicit boolean `consent: true`, a customer name and string mobile number. See the audit for optional fields, response and the limitations of local evidence. Do not assume the deployed host matches the local source.

Never expose credentials in frontend code, logs, documentation, test output or exports. Use synthetic records for tests. Preserve consent, source data, email behavior, stored leads, stable external IDs and CRM deduplication; do not treat a plain HTTP success as proof of lead creation. Validate admin capabilities and nonces, restrict outbound endpoints and protect personal data. WordPress database upgrades must be additive and preserve existing rows.

Run relevant backend tests and the PHP bridge harness (`plugin-repair/qa/php/php.exe plugin-repair/qa/bridge-tests.php`) when modifying these components. Add meaningful tests for changed behavior and document actual results, missing environments, database changes and outstanding work in `IMPLEMENTATION_PROGRESS.md`. A mock test is not an authenticated staging or production end-to-end test. Prepare installation and rollback instructions and verify actual deployed versions before any plugin release.
