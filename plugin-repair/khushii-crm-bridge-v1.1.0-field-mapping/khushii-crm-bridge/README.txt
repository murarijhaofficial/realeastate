Khushii CRM Lead Bridge 1.1.1 ? EstateDesk delivery repair

Install with chatbot 1.1.5 and property projects 2.3.1. Existing settings and queue records are retained. Back up the database before upgrading. Replace each plugin using WordPress Upload Plugin; do not delete its saved data.

Configure Khushii CRM Sync:
- Endpoint: https://YOUR-BACKEND/api/v1/integrations/website-leads
- Key: an active ed_live_ website API key from that CRM, associated with an active project.
- Delivery now always uses Bearer and canonical flat CRM JSON. Legacy header/wrapper choices are retained for compatibility but are ignored.
- In the CRM, keep this key's JSON mapping empty/default because the bridge sends canonical fields.
- New installations no longer assume an unverified Vercel endpoint. Existing endpoint settings remain unchanged and must be checked.

Install/activate bridge first, then updated chatbot and property plugins. Chatbot routes CRM delivery through the bridge when it is active, bypassing the legacy direct webhook. Chatbot 'queued' means queued, not delivered; check the bridge for 'synced'. Project enquiries are saved privately in WordPress, then queued. Source records remain available if queueing fails.

Queue retries reuse persisted external_id values. A successful 2xx response must include success=true and data.enquiry_id. Invalid keys/validation failures require correction and manual Retry. Retry cannot resend already synced entries. Interrupted workers can be reclaimed after five minutes. Configure a reliable WordPress cron runner. HTTP 401 may also come from hosting protection; use the accessible CRM backend endpoint.

This release does not backfill old property enquiries. Old chatbot entries can be queued with the chatbot Retry delivery action (which also retries email). Browser resubmission can still create a new source record: delivery retries are deduplicated, not independently submitted forms.

Field Mapping remains available for other server-side producers through enqueue_json(source, raw_json, stable_submission_id). It does not automatically attach the missing Khushii Enquiry Pro plugin. That plugin source is still needed for homepage/contact form integration.

Verification: PHP syntax parsed locally; no PHP runtime or WordPress instance available for live plugin integration tests. Test on staging before production: consent rejection, each enquiry type, one confirmed CRM lead, same-row retry, invalid key, malformed success response, and temporary outage recovery. Never paste credentials into chat.
