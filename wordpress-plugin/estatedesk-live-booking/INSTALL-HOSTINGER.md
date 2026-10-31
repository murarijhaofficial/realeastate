# Clean installation on Hostinger WordPress

The main plugin file must end up at exactly:

```text
public_html/wp-content/plugins/estatedesk-live-booking/estatedesk-live-booking.php
```

Do not activate the old browser URL that contains a temporary name such as `estatedesk-live-booking-XXXX`. That URL points to an upload path WordPress cannot find.

1. In **WordPress → Plugins**, remove any failed/deactivated EstateDesk Live Booking entry.
2. In **Hostinger hPanel → Files → File Manager**, open `public_html/wp-content/plugins/`.
3. Delete only the failed temporary EstateDesk folder, if present. Do not delete unrelated plugins.
4. Upload the current `estatedesk-live-booking-1.1.0.zip` to the `plugins` folder and extract it there.
5. Confirm the exact file path above. There must be one `estatedesk-live-booking` folder, not a duplicated nested folder.
6. Return to **WordPress → Plugins**, refresh the page, and activate **EstateDesk Live Booking** from its row.

If the `estatedesk-live-booking.php` file disappears after extraction, the hosting account is blocking or deleting it. Ask Hostinger to check write access to `wp-content/plugins` (directories normally need 755 and files 644) and its malware/security scanner. This error happens before any EstateDesk plugin code runs.

After activation, enter the deployed HTTPS CRM origin and a project UUID at **Settings → EstateDesk Live Booking**, then add `[estatedesk_live_booking]` to a page.
