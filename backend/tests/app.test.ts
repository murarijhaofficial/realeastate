import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.ts';
import { pool } from '../src/db.ts';
import jwt from 'jsonwebtoken';
import { crmBookingSchema, leadUpdateSchema, publicEnquirySchema, parse, plotSchema, plotUpdateSchema, projectCreateSchema, projectSchema, publicBookingSchema, userSchema } from '../src/validation.ts';

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

test('validates website enquiries and lead updates', () => {
  const enquiry = { customer_name: 'Taylor', mobile: '9876543210', project_id: '045c55b7-dc35-4ed8-9250-29fd4ce5c607', consent: true };
  assert.equal(parse(publicEnquirySchema, enquiry).customer_name, 'Taylor');
  assert.throws(() => parse(publicEnquirySchema, { ...enquiry, consent: false }));
  assert.throws(() => parse(publicEnquirySchema, { ...enquiry, customer_name: '   ' }));
  assert.throws(() => parse(publicEnquirySchema, { ...enquiry, email: 'invalid' }));
  assert.equal(parse(leadUpdateSchema, { lead_status: 'CONTACTED', remarks: 'Called' }).lead_status, 'CONTACTED');
  assert.throws(() => parse(leadUpdateSchema, { lead_status: 'UNKNOWN' }));
});

test('lead updates require authentication', async () => {
  const response = await request(app).patch('/api/v1/leads/045c55b7-dc35-4ed8-9250-29fd4ce5c607').send({ lead_status: 'CONTACTED' });
  assert.equal(response.status, 401);
});

test('website API keys are admin-managed, project-scoped, deduplicate retries and reject revoked keys', async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-website-key-test';
  const userId = '045c55b7-dc35-4ed8-9250-29fd4ce5c607';
  const projectId = '8d8ddbbc-8878-4191-a0aa-4ca20a0f4868';
  const keyId = '95ad4871-f30a-4b29-86b6-977aa035ccaa';
  let role = 'ADMIN', keyHash, revoked = false, receipt = false, leadCount = 0;
  pool.query = async (sql) => {
    if (sql.includes('SELECT role, is_active, token_version FROM users')) return { rowCount: 1, rows: [{ role, is_active: true, token_version: 0 }] };
    throw new Error(`Unexpected pool query: ${sql}`);
  };
  pool.connect = async () => ({
    release() {},
    async query(sql, args = []) {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
      if (sql.includes('SELECT id FROM projects')) return { rowCount: 1, rows: [{ id: projectId }] };
      if (sql.includes('INSERT INTO website_api_keys')) { keyHash = args[2]; return { rowCount: 1, rows: [{ id: keyId, name: args[0], key_prefix: args[1], project_id: args[3] }] }; }
      if (sql.includes('UPDATE website_api_keys SET revoked_at')) { revoked = true; return { rowCount: 1, rows: [{ id: keyId }] }; }
      if (sql.includes('SELECT k.id, k.project_id')) return { rowCount: !revoked && args[0] === keyHash ? 1 : 0, rows: !revoked && args[0] === keyHash ? [{ id: keyId, project_id: projectId, field_mapping: { customer_name: 'legacy.name' } }] : [] };
      if (sql.includes('SELECT l.lead_code AS enquiry_id')) { assert.equal(args[0], keyId); assert.equal(args[1], projectId); return { rowCount: 1, rows: [{ enquiry_id: 'LD-TEST', lead_status: 'NEW' }] }; }
      if (sql.includes('SELECT l.lead_code FROM website_lead_receipts')) return { rowCount: receipt ? 1 : 0, rows: receipt ? [{ lead_code: 'LD-TEST' }] : [] };
      if (sql.includes('SELECT id FROM customers')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO customers')) return { rowCount: 1, rows: [{ id: userId }] };
      if (sql.includes('SELECT u.id FROM users')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO leads')) { leadCount++; assert.equal(args[1], projectId); return { rowCount: 1, rows: [{ id: userId, lead_code: 'LD-TEST' }] }; }
      if (sql.includes('INSERT INTO website_lead_receipts')) receipt = true;
      return { rowCount: 1, rows: [] };
    },
  });
  try {
    const auth = `Bearer ${jwt.sign({ id: userId, token_version: 0 }, process.env.JWT_SECRET)}`;
    role = 'SALES_MANAGER';
    assert.equal((await request(app).post('/api/v1/integrations/website-keys').set('Authorization', auth).send({ name: 'Site', project_id: projectId })).status, 403);
    role = 'ADMIN';
    const created = await request(app).post('/api/v1/integrations/website-keys').set('Authorization', auth).send({ name: 'Site', project_id: projectId });
    assert.equal(created.status, 201);
    const key = created.body.data.key;
    assert.ok(key.startsWith('ed_live_'));
    assert.notEqual(keyHash, key);
    const payload = { customer_name: 'Taylor', mobile: '9876543210', consent: true, external_id: 'form-1', project_id: userId };
    const submit = () => request(app).post('/api/v1/integrations/website-leads').set('Authorization', `bearer ${key}`).set('X-EstateDesk-Format', 'canonical').send(payload);
    assert.equal((await submit()).status, 201);
    const retry = await submit();
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.duplicate, true);
    assert.equal(leadCount, 1);
    const fetchLeads = () => request(app).get('/api/v1/integrations/website-leads').set('Authorization', `Bearer ${key}`);
    const fetched = await fetchLeads();
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.leads[0].enquiry_id, 'LD-TEST');
    assert.equal(fetched.body.data.next_offset, null);
    assert.equal(fetched.headers['cache-control'], 'no-store');
    assert.equal((await request(app).get('/api/v1/integrations/website-leads')).status, 401);
    assert.equal((await request(app).get('/api/v1/integrations/website-leads?limit=101').set('Authorization', `Bearer ${key}`)).status, 400);
    assert.equal((await request(app).delete(`/api/v1/integrations/website-keys/${keyId}`).set('Authorization', auth)).status, 200);
    assert.equal((await submit()).status, 401);
    assert.equal((await fetchLeads()).status, 401);
  } finally { pool.query = originalQuery; pool.connect = originalConnect; if (originalSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalSecret; }
});
