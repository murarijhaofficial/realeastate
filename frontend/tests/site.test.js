import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('contains separate CRM and public booking entry pages', async () => {
  const crm = await fs.readFile('public/index.html', 'utf8');
  const booking = await fs.readFile('public/live-booking-status.html', 'utf8');

  assert.match(crm, /EstateDesk CRM/);
  assert.match(crm, /view-inventory/);
  assert.match(crm, /toggle-password/);
  assert.match(crm, /aria-label="Show password"/);
  assert.match(crm, /login-showcase/);
  assert.match(booking, /Explore plot availability/);
  assert.match(booking, /booking\.js/);
  assert.match(booking, /booking-form/);
  assert.match(booking, /does not reserve the plot/);
});

test('frontend API configuration supports a separately hosted backend', async () => {
  const config = await fs.readFile('public/api-config.js', 'utf8');
  const bookingPage = await fs.readFile('public/live-booking-status.html', 'utf8');
  const viteConfig = await fs.readFile('vite.config.js', 'utf8');

  assert.match(config, /ESTATEDESK_API_BASE_URL/);
  assert.doesNotMatch(config, /import\.meta\.env/);
  assert.match(bookingPage, /__ESTATEDESK_API_BASE_URL__/);
  assert.match(viteConfig, /\/api/);
  assert.match(viteConfig, /\/uploads/);
  assert.match(viteConfig, /live-booking-status/);
});

test('project setup captures plot details and exposes project highlights publicly', async () => {
  const app = await fs.readFile('src/main.tsx', 'utf8');
  const bookingPage = await fs.readFile('public/live-booking-status.html', 'utf8');
  const bookingScript = await fs.readFile('public/booking.js', 'utf8');
  const projectsPage = await fs.readFile('src/pages/ProjectsPage.tsx', 'utf8');

  assert.match(app, /Initial plot inventory/);
  assert.match(app, /data-plot-field="current_price"/);
  assert.match(app, /name="survey_number"/);
  assert.match(app, /name="highlights"/);
  assert.match(bookingPage, /project-highlights-list/);
  assert.match(bookingScript, /project\.highlights/);
  assert.match(projectsPage, /Draw selected plot/);
  assert.match(app, /saveMasterplanBoundary/);
  assert.match(bookingScript, /pointerenter/);
  assert.match(bookingScript, /if \(plot\.status === 'AVAILABLE'\) openBookingForm\(\)/);
  assert.match(bookingScript, /plot\.client/);
});

test('project editing, WordPress map details, and agent website requests stay connected', async () => {
  const app = await fs.readFile('src/main.tsx', 'utf8');
  const projectsPage = await fs.readFile('src/pages/ProjectsPage.tsx', 'utf8');
  const wordpress = await fs.readFile('../wordpress-plugin/estatedesk-live-booking/assets/live-booking.js', 'utf8');
  const api = await fs.readFile('../backend/src/app.ts', 'utf8');

  assert.match(projectsPage, /id="edit-project"/);
  assert.match(app, /method: project \? 'PATCH' : 'POST'/);
  assert.match(app, /<option value="INACTIVE".*Inactive/);
  assert.match(wordpress, /state\.data\.layout\.image_url/);
  assert.match(wordpress, /\['Client', plot\.client\]/);
  assert.match(wordpress, /plot\.status === 'AVAILABLE'\) openDialog\(\)/);
  assert.match(wordpress, /state\.selected\.status !== 'AVAILABLE'/);
  assert.match(api, /b\.source = 'WEBSITE'.*user_projects/s);
  assert.match(api, /userId \?\? plot\.assigned_sales_user_id/);
  assert.match(api, /plot\.status !== 'AVAILABLE'/);
});
