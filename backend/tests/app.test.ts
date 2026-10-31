import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.ts';
import { crmBookingSchema, parse, plotSchema, plotUpdateSchema, projectCreateSchema, projectSchema, publicBookingSchema, userSchema } from '../src/validation.ts';

test('exposes backend service information and database health', async () => {
  const response = await request(app).get('/');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { service: 'EstateDesk API', health: '/api/v1/health' });
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

test('validates project highlights and initial plot inventory', () => {
  const project = parse(projectCreateSchema, {
    project_code: 'RT-03',
    project_name: 'Sample project',
    highlights: ['Clear title', 'Road access'],
    initial_plots: [{
      plot_number: 'A-01',
      area_sq_yard: '400',
      area_sq_feet: '3600',
      road_width: '9',
      current_price: '2500000',
    }],
  });
  assert.deepEqual(project.highlights, ['Clear title', 'Road access']);
  assert.equal(project.initial_plots[0].area_sq_yard, 400);
  assert.equal(project.initial_plots[0].current_price, 2500000);
  assert.throws(() => parse(projectCreateSchema, {
    project_code: 'RT-04',
    project_name: 'Sample project',
    highlights: [''],
  }));
  assert.throws(() => parse(projectCreateSchema, {
    project_code: 'RT-05',
    project_name: 'Sample project',
    initial_plots: Array.from({ length: 501 }, (_, index) => ({ plot_number: String(index + 1) })),
  }));
});

test('accepts non-negative plot inventory values and rejects negative prices', () => {
  const plot = parse(plotSchema, {
    plot_number: '01',
    area_sq_yard: '400',
    current_price: '2500000',
    north_boundary: 'Plot no. 5',
    west_boundary: 'Internal road',
  });
  assert.equal(plot.area_sq_yard, 400);
  assert.equal(plot.north_boundary, 'Plot no. 5');
  assert.equal(plot.west_boundary, 'Internal road');
  assert.throws(() => parse(plotSchema, { plot_number: '01', current_price: -1 }));
  assert.throws(() => parse(plotSchema, { plot_number: '01', north_boundary: 'x'.repeat(101) }));
});

test('allows inventory status updates but never manual booking or approval statuses', () => {
  assert.equal(parse(plotUpdateSchema, { status: 'AVAILABLE' }).status, 'AVAILABLE');
  assert.equal(parse(plotUpdateSchema, { status: 'BLOCKED' }).status, 'BLOCKED');
  assert.throws(() => parse(plotUpdateSchema, { status: 'BOOKED' }));
  assert.throws(() => parse(plotUpdateSchema, { status: 'PENDING_APPROVAL' }));
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
