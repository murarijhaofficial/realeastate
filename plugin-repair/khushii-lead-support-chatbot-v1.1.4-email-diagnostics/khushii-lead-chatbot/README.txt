KHUSHII LEAD & SUPPORT CHATBOT v1.0.0

INSTALL
1. WordPress Admin > Plugins > Add New > Upload Plugin > select ZIP > Install > Activate.
2. Go to Khushii Chatbot in the WP admin menu.
3. Set notification email, enable widget, and optionally set an HTTPS CRM webhook and bearer token.
4. Configure WP SMTP for reliable email delivery.
5. Test a lead end-to-end and verify mail, stored lead, and CRM receipt.

CRM WEBHOOK
POST JSON: {"event":"lead.created","source":"khushii_chatbot","lead_id":123,"lead":{...}}
Authorization: Bearer <token> (when configured)
A 2xx response marks the lead as synced. Use a CRM-specific integration adapter if your CRM requires a different API schema, OAuth, or field mapping. The plugin does not directly integrate with an unspecified CRM.

NOTES
This is a guided rule-based chatbot, NOT a generative AI bot.
The widget collects and stores lead data in the WordPress database and sends a formatted HTML email using wp_mail().
Email 'sent' means wp_mail() accepted the message, not guaranteed inbox delivery.
The webhook 'synced' status means the receiving endpoint returned 2xx, not independently verified CRM record creation.
The plugin does not store full chat transcripts, only submitted lead fields.
Use privacy policy and consent language appropriate for your site. Configure HTTPS, backups and data retention. Test on staging before production.
No direct integration with Khushii Enquiry Pro is assumed; this plugin runs independently.

Version 1.1.3: Dedicated responsive completion card with reference number and enquiry summary. Email and CRM behavior unchanged.

Version 1.1.4: Adds a WordPress admin test notification and delivery diagnostics. Configure SMTP in WordPress for reliable inbox delivery.
