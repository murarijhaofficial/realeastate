# EstateDesk CRM

A mobile-responsive real estate CRM starter built with Node.js, Express, and PostgreSQL. It includes a role-aware CRM dashboard, project and plot inventory, an SVG layout editor, temporary holds, manager-approved bookings, lead management, public website APIs, and server-sent inventory updates.

## Requirements

- Node.js 20+
- Docker Desktop (or a PostgreSQL 14+ server)

## Run locally

1. Copy `.env.example` to `.env`. Set `ADMIN_NAME`, `ADMIN_EMAIL`, an `ADMIN_PASSWORD` of 12–72 UTF-8 bytes, and a private random `JWT_SECRET` of at least 32 characters. Keep `.env` private and never paste credentials into chat.
2. Start PostgreSQL with `docker compose up -d postgres`, or configure `DATABASE_URL` for an existing database.
3. Install dependencies: `npm ci`
4. Create the schema: `npm run db:migrate`
5. Create the administrator and initial Ratanpur project: `npm run db:seed`. If the example admin password is still present, first replace it in `.env` with a private password (12–72 UTF-8 bytes); a real JWT secret of at least 32 characters is also required.
6. (Optional) Create an isolated fictional sample project and inventory: `npm run db:seed:demo`
7. Start the backend and its built-in frontend together: `npm run dev`
8. Open `http://localhost:3000` and sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. The public inventory page is at `http://localhost:3000/live-booking-status`.

The local app is a single Express server: it serves the frontend files and `/api/v1` from port 3000. Check the backend and its PostgreSQL connection at `http://localhost:3000/api/v1/health`. Keep the `npm run dev` terminal open while using the app.

## Deploy: Render backend + Vercel frontend

The backend and database run on Render; the static browser frontend is built and hosted on Vercel. The frontend calls the Render API directly over HTTPS. The Render API allows browser requests only from the exact Vercel origin configured in `PUBLIC_WEB_ORIGIN`.

### 1. Deploy the backend and database to Render

1. Push this project to a Git provider supported by Render, then create a new **Blueprint** from the repository. Render reads [`render.yaml`](./render.yaml), provisions the Node web service and PostgreSQL database, runs `npm ci`, and applies SQL migrations before each deploy.
2. In the Render service's **Environment** settings, set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (12–72 UTF-8 bytes). Render generates `JWT_SECRET`; keep it private. Do not copy values from `.env` into source files.
3. Deploy and wait for `https://<your-render-service>.onrender.com/api/v1/health` to return `{"success":true,"data":{"status":"ok","database":"connected"}}`. Save the service's HTTPS origin (without a path).
4. In the Render service Shell, run `npm run db:seed` once to create the administrator and starter project. For a separate fictional demo project, run `npm run db:seed:demo` only if desired. Migrations run automatically; do not reseed real project data.

### 2. Deploy the frontend to Vercel

1. Import the same repository into Vercel, using the repository root as the project root. The included [`vercel.json`](./vercel.json) builds the static site into `dist`.
2. Add the Vercel environment variable `API_BASE_URL` with the Render HTTPS origin, for example `https://estatedesk-api.onrender.com` (no `/api/v1` suffix and no trailing path). Set it for each Vercel environment you deploy (Production, and Preview if needed), then deploy.
3. Open the Vercel deployment and note its exact origin, such as `https://your-crm.vercel.app`.
4. Add that exact origin to Render's `PUBLIC_WEB_ORIGIN` setting and redeploy the Render service. For a custom domain or a Vercel Preview deployment, add each exact browser origin as a comma-separated value. Do not use `*` for a production CRM.
5. Test sign-in, a public inventory request, a booking request, live inventory updates, and the health URL. The public page is available at `/live-booking-status` (and `/booking`).

`API_BASE_URL` is embedded into the public frontend at build time and is not a secret. Never put database credentials, admin passwords, or `JWT_SECRET` in Vercel variables or browser code. Use Render's managed database connection string and keep `JWT_SECRET` stable across deploys so existing sessions remain valid.

### Deployment limitations to address before real operations

- Uploaded layout images currently live in the Node service's local `uploads/` directory. Render's service filesystem is not persistent across deploys/restarts; configure persistent disk or object storage before relying on uploaded images.
- Keep the API to one running instance for now: live inventory updates use in-process events and are not shared across instances.
- Use a paid, persistent PostgreSQL plan for production data, and configure backups, custom domains/HTTPS, and monitoring. The included Render database plan is a starting point, not a backup policy.

The standard seed creates the Ratanpur project record only. No plot numbers, boundaries, prices, or survey measurements are fabricated for Ratanpur. The optional demo seed creates a separate, clearly labeled fictional project and schematic master plan (plots, internal roads, entrance, clubhouse, central park, and utility area) for UI testing; it is inactive and excluded from public APIs. The demo seed is safe to rerun, can update the existing demo layout, and does not change Ratanpur or other projects.

## Application features

- Short-lived JWT sign-in with bcrypt password hashes, revocable sessions, role permissions, project assignment checks, rate-limited public endpoints, security headers, and structured API errors.
- PostgreSQL migrations with UUID keys, fixed-precision financial values, status history, audit records, and a partial unique index preventing concurrent active bookings for a plot.
- Project and plot administration, layout image upload (JPEG/PNG/WebP; 10 MB limit), normalized SVG plot boundaries, draft/publish versions, and live status colors.
- Editable project metadata including type, land area, survey/location details, postal code, coordinates, description, and status.
- Transactional plot holds and booking requests; only managers can approve/reject, and a submitter cannot approve their own booking.
- Lead and customer capture, public website enquiry and booking-request APIs, and project-scoped inventory SSE events.

## Useful commands

```text
npm run dev
npm start
npm test
npm run db:migrate
npm run db:seed
npm run db:seed:demo
```

Use the **Edit project details** action on the Projects & Inventory page to update a project's metadata. Sample plots, customers, and bookings are fictional; keep them separate from real operations.

The public inventory and booking page is available at `/live-booking-status` (also `/booking`). It lists only active projects with published layouts. Visitors can select a plot on its published map or list, review plot information, and submit a non-binding request for an available plot; requests enter the manager approval queue and are not online payments or confirmed bookings. Publish verified project inventory before sharing this URL with customers.

## API

The versioned API is served at `/api/v1`. Authenticated CRM requests use `Authorization: Bearer <token>`.

- `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET|POST /users`, `PATCH /users/:userId` (administrator only)
- `GET|POST /users`, `PATCH /users/:userId` (administrator only)
- `GET|POST /projects`, `PATCH /projects/:projectId`
- `GET|POST /projects/:projectId/plots`, `PATCH /plots/:plotId`
- `POST /plots/:plotId/hold`, `POST /plots/:plotId/release-hold`, `GET /plots/:plotId/history`
- `GET /projects/:projectId/layouts`, `POST /projects/:projectId/layouts/upload`
- `POST /projects/:projectId/layouts/revisions` (copies the current published boundaries into a new draft)
- `PUT /layouts/:layoutId/plots/:plotId`, `POST /layouts/:layoutId/publish`
- `GET /bookings`, `POST /bookings`, `POST /bookings/:bookingId/approve`, `POST /bookings/:bookingId/reject`
- `GET|POST /leads`, `GET /customers`, `GET /dashboard`
- `GET /public/projects`, `GET /public/projects/:projectId`, `GET /public/projects/:projectId/plots`
- `GET /public/projects/:projectId/layout` (published plot boundaries for the public site)
- `POST /public/enquiries`, `POST /public/booking-requests`
- `GET /public/projects/:projectId/inventory/stream` (Server-Sent Events)

Public project and inventory APIs expose only active projects with a published layout. Public booking requests always enter the manager approval queue; they do not confirm a sale.

## Production notes

This is the initial MVP milestone, not a production deployment. Before launch, configure HTTPS, secure secret management, persistent/object file storage, backups, monitoring, refresh-token rotation/password recovery, durable webhook delivery, and a shared event broker for multi-instance SSE. Uploaded layout images currently use local disk storage. Public website CORS origins must be explicitly configured in `PUBLIC_WEB_ORIGIN`.

See [`agent.md`](./agent.md) for the implementation log, decisions, and remaining requirement checklist.
#   r e a l e a s t a t e  
 