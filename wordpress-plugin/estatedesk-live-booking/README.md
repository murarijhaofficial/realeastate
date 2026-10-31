# EstateDesk Live Booking WordPress plugin

This plugin displays a project’s public EstateDesk inventory in WordPress and sends non-binding requests to the CRM’s existing manager-approval queue. The CRM remains the source of truth: WordPress never stores plot status or customer bookings as its own records.

## Install

1. Zip the `estatedesk-live-booking` folder and upload it in **WordPress → Plugins → Add New → Upload Plugin**.
2. Activate it, then go to **Settings → EstateDesk Live Booking**.
3. Enter the public HTTPS origin of this CRM API, for example `https://crm.example.com`, and a published project UUID.
4. Add `[estatedesk_live_booking]` to a WordPress page. To override the configured project for one page, use `[estatedesk_live_booking project_id="PROJECT-UUID" title="Dholera Metro City live booking"]`.

## How live sync works

- The plugin requests the CRM’s public project, plot, and published-layout APIs server-to-server.
- The map displays the published plan image and mapped plot boundaries. Hover/focus shows status and plot details, including the masked client name supplied by the CRM for approved bookings.
- Selecting an available plot opens the custom request form. Other statuses cannot open it; the CRM rechecks availability inside a database transaction when receiving each submission, so near-simultaneous requests cannot create duplicate active bookings.
- A short ten-second WordPress cache reduces duplicate requests; browsers refresh availability every fifteen seconds and the plugin refreshes the default project hourly through WP-Cron.
- A booking submission is validated and rate-limited by WordPress, then forwarded to `POST /api/v1/public/booking-requests`. It becomes a `PENDING_APPROVAL` request in EstateDesk, appears in the CRM booking queue and the project-assigned agents’ panel, and takes the plot out of availability while awaiting approval. It is never a confirmed sale.
- CRM administrators and project managers can edit project information and switch project status between active, inactive, and archived. Only active projects with published plans are served by the booking widget.

The plugin does not need, store, or expose a CRM JWT, database URL, or admin password. Use an HTTPS CRM origin in production.

## Before going live

- Publish the project layout in EstateDesk. Only active projects with a published layout are exposed by the CRM public API.
- Ensure the WordPress host can make outbound HTTPS requests to the CRM API.
- Keep the CRM API and WordPress site on HTTPS. Configure backups, monitoring, privacy policy/consent wording, and the appropriate anti-spam policy for your site.
