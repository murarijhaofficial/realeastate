=== Nestoria Property Projects ===
Contributors: custom
Tags: real estate, property, projects, booking, enquiries, whatsapp
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.2
License: GPLv2 or later

A responsive property project listing and detail page plugin with project galleries, enquiry forms, email notifications, WhatsApp click-to-chat and a WordPress leads dashboard.

== Installation ==
1. In WordPress go to Plugins > Add New Plugin > Upload Plugin.
2. Upload nestoria-property-projects.zip and click Install Now.
3. Activate the plugin.
4. Open Property Projects > Settings and set the enquiry email and WhatsApp number.
5. Add a project under Property Projects > Add New Project.
6. Set a Featured Image, upload gallery images, fill in Project Information, and publish.

== Display ==
The plugin automatically renders its custom project detail layout on each published project URL. The /projects/ archive uses a dedicated responsive portfolio layout with category filters and live search.
Use [property_projects] to show a project grid on any page.
Use [property_project id="123"] to embed one project.
Use [property_booking_form project_id="123"] to show a standalone enquiry form.

== Email delivery ==
The plugin uses WordPress wp_mail(). For reliable delivery, configure SMTP with your hosting provider or a reputable SMTP plugin. Test email delivery after installation.

== WhatsApp ==
WhatsApp buttons open wa.me with a prefilled enquiry message. The visitor must press Send in WhatsApp. Automatic server-to-WhatsApp message delivery requires a separately configured WhatsApp Business Cloud API integration and is not included in this version.

== Privacy ==
Enquiries are stored in WordPress as private Property Enquiries and are visible to administrators/editors with access to the project menu. Add an appropriate privacy-policy notice and retention policy for your jurisdiction. The form includes a contact consent checkbox.


== Version 1.2.0 ==
Updated Khushii Developer archive styling and content. Added homepage three-card showcase shortcode:
[khushii_project_showcase]
Optional: [khushii_project_showcase limit="3" title="Featured Projects" subtitle="Explore our property portfolio" button="Explore More Projects"]
The existing [property_projects], [property_project] and [property_booking_form] shortcodes remain available.

Version 1.3.0: Dark navy three-card homepage showcase styling with centered SEO heading, responsive project cards and explore-all CTA.

Version 1.4.0: compact archive hero; improved enquiry modal close control.

1.5.0: Fixed frontend cache version mismatch (1.3.0 constant), reduced archive hero and moved modal close outside scrolling form content.


== 1.6.0 Visual Plot Availability ==
Adds a project editor panel for a master layout image, plot statuses, and optional clickable SVG polygon coordinates.
Format: plot number | available/reserved/sold | area sq yd | x,y;x,y;x,y (percentage of image width/height).
No plots or statuses are populated automatically. Verify plot positions, legal documents and availability.
