# EstateDesk CRM

A mobile-responsive real estate CRM built as a pnpm monorepo with a separate Vite frontend, Node.js/Express backend, and PostgreSQL database. It includes a role-aware CRM dashboard, project and plot inventory, an SVG layout editor, temporary holds, manager-approved bookings, lead management, public website APIs, and server-sent inventory updates.

## Requirements

- Node.js 20+
- pnpm 10+ (the workspace pins pnpm 10.29.2; use `corepack enable` if needed)
- Docker Desktop (or a PostgreSQL 14+ server)

## Application structure

- `frontend/src/pages/` contains one TSX module per CRM page: sign-in, dashboard, projects, leads, bookings, team, and settings.
- `frontend/src/components/` contains the shared workspace shell and page-header UI.
- `frontend/src/lib/` is the typed browser API boundary.
- `backend/src/` uses native TypeScript modules. Node.js 22.6+ is required for built-in TypeScript stripping support.

## Run locally

1. Copy `.env.example` to `.env`. Set `ADMIN_NAME`, `ADMIN_EMAIL`, an `ADMIN_PASSWORD` of 12–72 UTF-8 bytes, and a private random `JWT_SECRET` of at least 32 characters. Keep `.env` private and never paste credentials into chat.
2. Start PostgreSQL with `docker compose up -d postgres`, or configure `DATABASE_URL` for an existing database.
3. Install workspace dependencies from the repository root: `pnpm install`
4. Create the schema and administrator: `pnpm db:migrate`, then `pnpm db:seed`.
5. Start both packages: `pnpm dev`.
6. Open the frontend at `http://localhost:5173` (or `http://127.0.0.1:5173`). The Vite development server proxies API, uploads, and live-event requests to the backend at `http://localhost:3000`; check backend/database health at `http://localhost:3000/api/v1/health`.

The backend and frontend are separate packages and can also be started in separate terminals:

```text
pnpm dev:backend
pnpm dev:frontend
```

You can run `pnpm --filter @estatedesk/backend dev` and `pnpm --filter @estatedesk/frontend dev` directly as well. The frontend package contains the CRM and public booking page; the backend package contains the Express API, migrations, seeds, and tests.

## Deploy: Render backend + Vercel frontend

The backend and database run on Render; the frontend is built and hosted separately on Vercel. Set the Render service's **Root Directory** to the repository root so pnpm can see the workspace lockfile and both packages.

### 1. Deploy the backend and database to Render

1. Push this project to a Git provider supported by Render, then create a new **Blueprint** from the repository root. Render reads [`render.yaml`](./render.yaml), provisions the Node web service and PostgreSQL database, installs the pnpm workspace, and applies SQL migrations before each deploy.
2. In the Render service's **Environment** settings, set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (12–72 UTF-8 bytes). Render generates `JWT_SECRET`; keep it private. The Blueprint uses Render's private database URL and enables TLS while allowing its internal self-signed certificate (`DATABASE_SSL_REJECT_UNAUTHORIZED=false`); other production deployments keep certificate verification enabled by default. Do not copy values from `.env` into source files.
3. Deploy and wait for `https://<your-render-service>.onrender.com/api/v1/health` to return `{"success":true,"data":{"status":"ok","database":"connected"}}`. Save the service's HTTPS origin (without a path).
4. In the Render service Shell, run `pnpm --filter @estatedesk/backend db:seed` once to create the administrator and starter project. For a separate fictional demo project, run `pnpm --filter @estatedesk/backend db:seed:demo` only if desired. Migrations run automatically; do not reseed real project data.

### 2. Deploy the frontend to Vercel

1. Import the same repository into Vercel and set **Root Directory** to `frontend`. The frontend's [`vercel.json`](./frontend/vercel.json) builds and deploys only that package.
2. Add the Vercel environment variable `VITE_API_BASE_URL` with the Render HTTPS origin, for example `https://estatedesk-api.onrender.com` (no `/api/v1` suffix). Set it for each Vercel environment you deploy (Production, and Preview if needed), then deploy.
3. Open the Vercel deployment and note its exact origin, such as `https://your-crm.vercel.app`.
4. Add that exact origin to Render's `PUBLIC_WEB_ORIGIN` setting and redeploy the Render service. For a custom domain or a Vercel Preview deployment, add each exact browser origin as a comma-separated value. Do not use `*` for a production CRM. The public availability page is deployed at `/live-booking-status` (also `/booking`).
5. Test sign-in, a public inventory request, a booking request, live inventory updates, and the health URL. The public page is available at `/live-booking-status` (and `/booking`).

`VITE_API_BASE_URL` is embedded into the public frontend at build time and is not a secret. Never put database credentials, admin passwords, or `JWT_SECRET` in Vercel variables or browser code. Use Render's managed database connection string and keep `JWT_SECRET` stable across deploys so existing sessions remain valid.

### Deployment limitations to address before real operations

- Uploaded layout images currently live in the Node service's local `uploads/` directory. Render's service filesystem is not persistent across deploys/restarts; configure persistent disk or object storage before relying on uploaded images.
- Keep the API to one running instance for now: live inventory updates use in-process events and are not shared across instances.
- Use a paid, persistent PostgreSQL plan for production data, and configure backups, custom domains/HTTPS, and monitoring. The included Render database plan is a starting point, not a backup policy.

The standard seed creates the Ratanpur project record only. No plot numbers, boundaries, prices, or survey measurements are fabricated for Ratanpur. The optional demo seed creates a separate, clearly labeled fictional project and schematic master plan (plots, internal roads, entrance, clubhouse, central park, and utility area) for UI testing; it is inactive and excluded from public APIs. The demo seed is safe to rerun, can update the existing demo layout, and does not change Ratanpur or other projects.

## Application features

- Short-lived JWT sign-in with bcrypt password hashes, revocable sessions, role permissions, project assignment checks, rate-limited public endpoints, security headers, and structured API errors.
- PostgreSQL migrations with UUID keys, fixed-precision financial values, status history, audit records, and a partial unique index preventing concurrent active bookings for a plot.
- Project and plot administration, including location/legal metadata, public project highlights, optional initial plot records with dimensions, facing, road width, boundary neighbours, and price. Upload verified master-plan images, trace normalized SVG plot boundaries, and publish versioned layouts. Public plot maps show status-colored plots, hover details, and allow booking requests only for available plots.
- Editable project metadata including type, land area, survey/location details, postal code, coordinates, description, and status.
- Transactional plot holds and booking requests; only managers can approve/reject, and a submitter cannot approve their own booking.
- Lead and customer capture, public website enquiry and booking-request APIs, and project-scoped inventory SSE events.

## Useful commands

```text
pnpm dev
pnpm dev:backend
pnpm dev:frontend
pnpm build
pnpm test
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo
```

Use **Projects & inventory** to create a project and add plots with their areas, dimensions, facing, road width, neighbouring boundaries, and prices. Under **Project master plan**, upload the verified site-plan image, choose each plot, trace its boundary on the image, and save it. Publish is enabled only after a plan image is uploaded and every plot is mapped. Create a draft revision before changing a published plan. Use the **Edit project details** action to update project metadata. Sample plots, customers, and bookings are fictional; keep them separate from real operations.

The public inventory and booking page is available at `/live-booking-status` (also `/booking`). It lists only active projects with published layouts. Visitors can review project location, land area, survey details, highlights, and plot inventory; select a plot on its published map or list; and submit a non-binding request for an available plot. Requests enter the manager approval queue and are not online payments or confirmed bookings. Publish verified project inventory before sharing this URL with customers.

Administrators and project managers can edit project details and change its status on the **Projects & inventory** page. The WordPress integration is in [`wordpress-plugin/estatedesk-live-booking`](./wordpress-plugin/estatedesk-live-booking); it shows the published map, masked client names, hover details, and the same available-only request form. Accepted requests immediately mark the plot pending and appear in CRM bookings for staff assigned to that project.

Users with inventory-write access can edit plot details and set an editable plot to Available or Blocked. Available plots can be submitted with customer and booking details to the approval queue; plots in pending approval or confirmed/registered states are locked against edits. Only an authorized manager's approval changes a pending plot to Booked.

## API

The versioned API is served at `/api/v1`. Authenticated CRM requests use `Authorization: Bearer <token>`.

- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET|POST /users`, `PATCH /users/:userId` (administrator only)
- `GET|POST /users`, `PATCH /users/:userId` (administrator only)
- `GET|POST /projects`, `PATCH /projects/:projectId`
- `GET|POST /projects/:projectId/plots`, `PATCH /plots/:plotId`
- `POST /plots/:plotId/hold`, `POST /plots/:plotId/release-hold`, `GET /plots/:plotId/history`
- `GET /projects/:projectId/layouts`, `POST /projects/:projectId/layouts/upload`
- `POST /projects/:projectId/layouts/revisions` (copies the latest layout boundaries into a new draft)
- `PUT /layouts/:layoutId/plots/:plotId`, `POST /layouts/:layoutId/publish`
- `GET /bookings`, `POST /bookings`, `POST /bookings/:bookingId/approve`, `POST /bookings/:bookingId/reject`
- `GET|POST /leads`, `GET /customers`, `GET /dashboard`
- `GET /public/projects`, `GET /public/projects/:projectId`, `GET /public/projects/:projectId/plots`
- `GET /public/projects/:projectId/layout` (published plot boundaries for the public site)
- `POST /public/enquiries`, `POST /public/booking-requests`
- `GET /public/projects/:projectId/inventory/stream` (Server-Sent Events)

Public project and inventory APIs expose only active projects with a published layout. Public booking requests always enter the manager approval queue; they do not confirm a sale.

## Production notes

This is the initial MVP milestone, not a production deployment. Before launch, configure HTTPS, secure secret management, persistent/object file storage, backups, monitoring, refresh-token rotation/password recovery, durable webhook delivery, and a shared event broker for multi-instance SSE. Uploaded layout images currently use `backend/uploads` on local disk. Public website CORS origins must be explicitly configured in `PUBLIC_WEB_ORIGIN`.

See [`agent.md`](./agent.md) for the implementation log, decisions, and remaining requirement checklist.
