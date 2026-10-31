# Real Estate CRM — Agent Progress Log

This file is the project implementation log. Update it when features, architecture, setup, or verification status changes.

## Product and stack decisions

- Product: responsive real estate CRM and plot inventory management system, based on `requirement.txt.txt`.
- Backend: Node.js + Express, PostgreSQL, parameterized SQL with `pg`, and SQL-file migrations.
- Frontend: responsive browser UI served by Express (vanilla JavaScript and SVG). This keeps the initial application self-contained; a separate React/Next.js frontend can be introduced later.
- Architecture: modular monolith; PostgreSQL transactions and row locks are authoritative for inventory and booking state.
- Layout reference: Ratanpur, Survey No. 254/1. The standard seed deliberately creates no fabricated plot boundaries or sales data for Ratanpur. A separate opt-in demo seed creates a clearly labeled, inactive fictional project for UI testing.

## Progress updates

### 2026-10-31 — Initial application foundation

- Added project setup, environment template, local PostgreSQL Docker Compose service, migrations, administrator seed, and startup scripts.
- Added PostgreSQL schema for accounts, project assignments, projects, plots, layouts/polygons, customers, leads, bookings, approval history, payment records, and audit history.
- Added role-aware authentication, revocable JWT sessions, administrator team/project assignments, project access checks, public API rate limiting, response security headers, and validation/error handling.
- Added the initial dashboard, project/plot workflow, responsive inventory UI, SVG polygon drawing and publishing flow, layout image upload, leads, and approval queue.
- Added transactional holds, automatic hold expiry, manager-only booking decisions, a partial unique active-booking index, public enquiries/booking requests, and project inventory SSE.
- Added safe draft layout revisions that copy the latest published plot geometry; published boundaries are immutable through the editing API.
- Generated local development admin/JWT secrets in `.env` after the user approved replacing example values; seeded the configured administrator and starter Ratanpur project without printing credentials.
- Added a follow-up session-revocation migration because the first schema migration had already been applied before that field was added.
- Added README setup/API notes. The requirements checklist and known gaps remain below.

### 2026-10-31 — Login experience refresh

- Replaced the basic sign-in page with a responsive split-screen design, custom plot-layout illustration, refined form fields, and mobile-first card layout.
- Added keyboard-accessible show/hide password control, inline sign-in errors, browser input validation, and a disabled/loading submit state.
- Verified the desktop and 390px mobile layouts in the browser; toggling password visibility updates the field type and accessible label, with no horizontal overflow.

### 2026-10-31 — Login connectivity troubleshooting

- Diagnosed the sign-in screen's `Failed to fetch` as a network-level request failure, not invalid credentials. Verified the active server at port 3000, database health, and a successful login/session check using the configured local admin account without printing credentials.
- Improved browser-facing network errors to explain that the CRM server must be running and the page refreshed. Simulated an unavailable login endpoint in the browser and confirmed the sign-in form displays the actionable message.
- `npm test`: 7 passing; frontend syntax check passed.

### 2026-10-31 — Public live inventory and booking requests

- Added `/live-booking-status` and `/booking`, a responsive public project page with published plot-map selection, searchable availability, plot details/prices, booking enquiry form, consent, confirmation reference, and live inventory refresh.
- Added a public published-layout endpoint; public inventory remains limited to active projects and published layouts, keeping the inactive demo project private.
- Connected website booking requests to the existing transactional booking/manager-approval flow. Added strict validation for customer details, consent, emails, remarks, and non-negative CRM booking amounts; the public form explicitly does not take payment or confirm a reservation.
- Replaced the CRM's prompt-based booking flow with a structured booking form and display proposed booking amount, total price, source, and approval status in the booking queue.
- Browser-tested the responsive public page and simulated a complete plot selection and booking-request submission. The configured database currently has no active project with a published layout, so the real public site correctly shows its no-projects state until verified inventory is published.
- `npm test`: 10 passing; `npm audit --omit=dev`: 0 vulnerabilities; changed JavaScript syntax checks passed.

### 2026-10-31 — Sample project and editable details

- Added migration 003 for project type, land area/unit, taluka, postal code, and coordinates.
- Added create/edit controls and project overview cards for project metadata, with coordinate validation and status visibility.
- Added the separate, repeatable `npm run db:seed:demo` command. It creates an inactive fictional project with 12 normalized schematic plots, a published demo layout, sample customers, a lead, and pending/approved bookings; it does not modify Ratanpur.
- Expanded the demo layout into a labeled master-plan schematic with internal streets, a main entrance, clubhouse, central park, utility area, and north indicator; it remains clearly marked as non-survey/non-construction reference art.
- Labeled the sample project throughout the CRM and documented that all included people, plot values, and bookings are fictional. Public APIs continue to exclude it while inactive.
- Kept `DEMO-` projects inactive in create/update APIs and removed the activation/code-edit controls for the sample project to avoid exposing fictional inventory.
- Avoided reconnecting the public inventory event stream for inactive projects.

## Current implementation status

| Requirement area | Status | Notes |
|---|---|---|
| Node.js + Express + PostgreSQL foundation | Implemented | Docker Compose provides local PostgreSQL; schema is migration-managed. |
| Admin login and role-aware authorization | Initial implementation | Short-lived revocable JWTs, bcrypt hashes, and an admin team/project-access screen; refresh rotation and password recovery remain. |
| Projects and project access | Initial implementation | Admin creates and edits project metadata; non-admin access requires `user_projects` assignments. |
| Plot inventory | Initial implementation | Create/list/update plot details, status and history APIs. Bulk spreadsheet import/export remains. |
| Interactive layout | Initial implementation | Image upload, normalized editable SVG polygon mapping, safe draft revisions, and publishing. Undo/redo, map vertex editing, and version restore remain. |
| Holds and manager-approved bookings | Initial implementation | PostgreSQL locking/transactions, expiry worker, approval/rejection history, and active-booking uniqueness. Cancellation/registration workflows remain. |
| Customers and leads | Initial implementation | CRM/public lead creation and scoped lists. Follow-up activity timeline and assignment workflows remain. |
| Existing website integration | Initial implementation | Public project/inventory/enquiry/booking APIs and SSE. Signed durable webhooks and API-client credentials remain. |
| Payments, receipts, reports | Schema only | Operational APIs and reporting UI remain. |
| Audit history | Initial implementation | Login, project, lead, hold, and booking actions are recorded; expand coverage as workflows are added. |
| Production readiness | Not started | Storage, HTTPS/deployment, secrets, backups, monitoring, load/security/UAT tests remain. |

## Local development

See `README.md`. Quick start:

1. Copy `.env.example` to `.env`, configure a strong admin password and JWT secret.
2. Run `docker compose up -d postgres`.
3. Run `npm install`, `npm run db:migrate`, `npm run db:seed`, then `npm run dev`.
4. Optionally run `npm run db:seed:demo` for separate fictional test inventory; open `http://localhost:3000`.

## Verification log

- Database URL from the user's `.env` connected successfully; a read-only check found no existing public tables before setup.
- Applied SQL migrations 001–003 successfully; migration 003 adds project metadata fields.
- Started Express against configured PostgreSQL; `/api/v1/health` returned `ok` and `connected`.
- Seeded the administrator and starter project; authenticated successfully through `/auth/login`, `/auth/me`, and the project list API. Credentials remain only in the ignored local `.env`.
- Seeded the separate demo project and verified a repeat seed is a no-op. Authenticated API checks confirmed 12 internal demo plots, one published schematic layout, and exclusion of the inactive project from the public listing and detail endpoint.
- `npm test`: 7 passing. Changed JavaScript files passed `node --check`.
- Upgraded the demo's published plot coordinates to a 12-plot master plan with internal roads, entrance, clubhouse, central park, utility area, and north indicator. Existing draft layouts were preserved; a subsequent seed run made no layout changes.
- Confirmed all 12 published plot geometries remain normalized, the project is inactive, and `npm test` still passes (7/7).

## Next recommended work

1. Sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the local `.env`; do not share these values in chat.
2. Add role-specific API tests and booking concurrency integration tests.
3. Complete cancellation, registration, payments, lead activities/follow-ups, and plot import/export.
4. Add durable signed webhooks, refresh-token rotation, document storage, backup/deployment instructions, and production security testing.
