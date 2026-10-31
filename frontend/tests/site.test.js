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
