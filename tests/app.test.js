import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { crmBookingSchema, parse, plotSchema, projectSchema, publicBookingSchema, userSchema } from '../src/validation.js';

test('serves the responsive CRM sign-in application', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.match(response.text, /EstateDesk CRM/);
  assert.match(response.text, /view-inventory/);
  assert.match(response.text, /toggle-password/);
  assert.match(response.text, /aria-label="Show password"/);
  assert.match(response.text, /login-showcase/);
});

test('serves same-origin API configuration for local development', async () => {
  const response = await request(app).get('/api-config.js');
  assert.equal(response.status, 200);
  assert.match(response.text, /export const API_BASE_URL = ''/);
});

test('serves project detail editing and clearly labeled sample project UI', async () => {
  const response = await request(app).get('/app.js');
  assert.equal(response.status, 200);
  assert.match(response.text, /Edit project details/);
  assert.match(response.text, /Total land area/);
  assert.match(response.text, /Sample data only/);
  assert.match(response.text, /hidden from public APIs/);
  assert.match(response.text, /Unable to reach the CRM server/);
  assert.match(response.text, /drawDemoMasterPlan/);
  assert.match(response.text, /CENTRAL PARK/);
  assert.match(response.text, /CLUBHOUSE/);
  assert.match(response.text, /ENTRANCE/);
  assert.match(response.text, /Proposed booking amount/);
});

test('serves the public live inventory and booking experience', async () => {
  for (const route of ['/live-booking-status', '/booking']) {
    const response = await request(app).get(route);
    assert.equal(response.status, 200);
    assert.match(response.text, /Explore plot availability/);
    assert.match(response.text, /booking\.js/);
    assert.match(response.text, /booking-form/);
    assert.match(response.text, /does not reserve the plot/);
    assert.doesNotMatch(response.text, /pattern="\[\+/);
  }
  const script = await request(app).get('/booking.js');
  assert.equal(script.status, 200);
  assert.match(script.text, /public\/booking-requests/);
  assert.match(script.text, /not a confirmed booking/i);
});

test('validates customer details, consent, and non-negative CRM booking amounts', () => {
  const ids = { project_id: '045c55b7-dc35-4ed8-9250-29fd4ce5c607', plot_id: '8d8ddbbc-8878-4191-a0aa-4ca20a0f4868' };
  const websiteRequest = parse(publicBookingSchema, {
    ...ids,
    customer: { name: 'Taylor Example', mobile: '+91 98765 43210', email: 'taylor@example.com' },
    consent: true,
    website: '',
  });
  assert.equal(websiteRequest.consent, true);
  assert.throws(() => parse(publicBookingSchema, { ...ids, customer: { name: 'Taylor', mobile: '123' }, consent: false }));
  assert.throws(() => parse(publicBookingSchema, {
    ...ids, customer: { name: 'Taylor', mobile: '9876543210', email: 'invalid' }, consent: true,
  }));
  const crmRequest = parse(crmBookingSchema, {
    plot_id: ids.plot_id,
    customer: { full_name: 'Taylor Example', mobile: '9876543210', booking_amount: '50000' },
  });
  assert.equal(crmRequest.customer.booking_amount, 50000);
  assert.throws(() => parse(crmBookingSchema, {
    plot_id: ids.plot_id,
    customer: { full_name: 'Taylor', mobile: '9876543210', booking_amount: -1 },
  }));
});

test('rejects website booking requests without consent before database access', async () => {
  const response = await request(app).post('/api/v1/public/booking-requests').send({
    project_id: '045c55b7-dc35-4ed8-9250-29fd4ce5c607',
    plot_id: '8d8ddbbc-8878-4191-a0aa-4ca20a0f4868',
    customer: { name: 'Taylor Example', mobile: '9876543210' },
    consent: false,
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('returns a structured 404 for an unknown API route', async () => {
  const response = await request(app).get('/api/v1/unknown');
  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('validates required project identity fields', () => {
  const project = parse(projectSchema, { project_code: 'RT-01', project_name: 'Ratanpur' });
  assert.equal(project.project_code, 'RT-01');
  assert.throws(() => parse(projectSchema, { project_name: 'Missing code' }));
});

test('validates project metadata and geographic coordinate bounds', () => {
  const project = parse(projectSchema, {
    project_code: 'RT-02',
    project_name: 'Sample project',
    project_type: 'RESIDENTIAL',
    total_land_area: '1.25',
    area_unit: 'ACRE',
    latitude: '23.1',
    longitude: '72.5',
  });
  assert.equal(project.total_land_area, 1.25);
  assert.equal(project.latitude, 23.1);
  assert.throws(() => parse(projectSchema, {
    project_code: 'RT-02',
    project_name: 'Sample project',
    latitude: 100,
  }));
});

test('accepts non-negative plot inventory values and rejects negative prices', () => {
  const plot = parse(plotSchema, { plot_number: '01', area_sq_yard: '400', current_price: '2500000' });
  assert.equal(plot.area_sq_yard, 400);
  assert.throws(() => parse(plotSchema, { plot_number: '01', current_price: -1 }));
});

test('requires a valid role and a bcrypt-safe strong password for team accounts', () => {
  const user = parse(userSchema, {
    full_name: 'Sales User',
    email: 'sales@example.com',
    password: 'StrongPass123!',
    role: 'SALES_EXECUTIVE',
  });
  assert.deepEqual(user.project_ids, []);
  assert.throws(() => parse(userSchema, {
    full_name: 'Sales User',
    email: 'sales@example.com',
    password: 'short',
    role: 'SUPERUSER',
  }));
  assert.throws(() => parse(userSchema, {
    full_name: 'Sales User',
    email: 'sales@example.com',
    password: 'x'.repeat(73),
    role: 'SALES_EXECUTIVE',
  }));
});
