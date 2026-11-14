# Khushii Developer lead capture review ? 14 November 2026

Scope: public HTML and JavaScript of the homepage, contact pages, project detail, project listing, about page and linked privacy URL. No enquiries were submitted. No WordPress administrator or server access was available; backend CRM delivery is unverified. This is not a complete browser/device or private-plugin audit.

## Confirmed findings

- Homepage and /contact-us/ use Khushii Enquiry Pro 2.3.0, posting to WordPress admin-ajax.php with action khep_submit. Browser fields: name, email, phone, interest, message and consent. Message limit is 3,000 characters.
- Chatbot uses Khushii Lead Chatbot 1.1.4 and POST /wp-json/klc/v1/lead. It collects project, category, budget, timeline and message with contact details and boolean consent.
- /projects/kd-antriksha-residency/ uses Nestoria Property Projects 2.2.0, posting action npp_submit_enquiry. Fields include WordPress project_id=358, plot_size, budget and visit_date. WordPress numeric IDs must not be used as CRM UUIDs; route via the configured project-scoped key.
- These public scripts confirm WordPress submission, not CRM delivery. The server-side forwarding code is unavailable.
- Browser scripts reviewed do not explicitly attach stable external_id values; server-side ID generation and retry persistence need verification.
- /projects/antriksh/ returns 404 but is linked from the homepage. Replace links with /projects/kd-antriksha-residency/ and add a redirect.
- /contact/ correctly redirects to /contact-us/.
- /privacy-policy/ returns 404. Publish the intended policy and repair the footer link.
- Newsletter code explicitly performs validation only, without saving or sending subscriptions. Connect a separate opt-in subscription system or remove the signup until ready. Email-only subscribers are not valid property leads.
- WhatsApp buttons are wa.me links; clicking does not itself create a CRM lead.

## CRM changes implemented locally

Website messages now accept 3,000 characters. Supported optional fields: interest, project, category, plot_size, budget, timeline, visit_date, page_url, utm_source, utm_medium and utm_campaign. They are preserved as labelled lead notes and displayed under Enquiry details. Existing per-key mapping supports nested source payloads. Notes can be edited up to 8,000 characters.

## Required website fixes after plugin source is supplied

1. Forward successful, consented submissions from all three handlers server-side using the project-scoped website API key. Keep keys out of JavaScript.
2. Convert a checked WordPress checkbox value of "1" to JSON true after validation; never infer consent when absent.
3. Store a durable source identifier and reuse it as external_id on retries. Distinguish WordPress receipt from confirmed CRM delivery; retain failed entries for retry.
4. Preserve project/plot interest and optional qualification fields. Capture page URL and campaign attribution with bounded lengths. Review phone normalization before merging contacts.
5. Show structured CRM errors to administrators, retain credentials on blank masked-field saves, and stop automatic retries for 401 until credentials are corrected.
6. End-to-end test each form and chatbot using an approved test identity: verify one CRM lead, correct notes/project, duplicate retry protection, no-consent rejection and queued recovery after outage.

Needed source packages: khushii-enquiry-pro, khushii-lead-chatbot, nestoria-property-projects, and the CRM delivery connector if separate. Public PHP URLs do not expose their source. Do not send passwords or API keys in chat.
