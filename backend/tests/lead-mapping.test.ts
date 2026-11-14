import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWebsiteLead, validateMapping, websiteLeadRemarks } from '../src/lead-mapping.ts';

test('maps flat aliases and nested array paths without losing phone formatting', () => {
  assert.equal(mapWebsiteLead({ name: 'Alex', phone: '+910012345678', consent: true }).mobile, '+910012345678');
  const result = mapWebsiteLead({ person: { full: 'Alex' }, fields: [{ value: '0012345678' }], accepted: true, ignored: 'secret' }, { customer_name: 'person.full', mobile: 'fields[0].value', consent: 'accepted' });
  assert.deepEqual(result, { customer_name: 'Alex', mobile: '0012345678', consent: true });
});
test('rejects ambiguous fields, unsafe paths, missing consent and non-string phone numbers', () => {
  assert.throws(() => mapWebsiteLead({ name: 'A', full_name: 'B', phone: '12345678', consent: true }), /Multiple/);
  for (const consent of [false, undefined, 'true', 1]) assert.throws(() => mapWebsiteLead({ name: 'A', phone: '12345678', consent }));
  assert.throws(() => mapWebsiteLead({ name: 'A', phone: 12345678, consent: true }), /must be text/);
  for (const path of ['__proto__.name', 'a.constructor.name', 'a()', 'a..name']) assert.throws(() => validateMapping({ customer_name: path }));
  assert.throws(() => validateMapping({ unknown: 'name' }));
  assert.throws(() => mapWebsiteLead([]), /one lead/);
});
test('explicit mapping resolves ambiguous aliases and preserves retry identity', () => {
  const result = mapWebsiteLead({ name: 'A', full_name: 'B', phone: '12345678', consent: true, id: 'submission-1' }, { customer_name: 'full_name', external_id: 'id' });
  assert.equal(result.customer_name, 'B');
  assert.equal(result.external_id, 'submission-1');
});

test('preserves Khushii website requirements and accepts full-length enquiry messages', () => {
  const data = mapWebsiteLead({ name: 'Example', phone: '+919876543210', consent: true, message: 'x'.repeat(3000), interest: 'Site Visit', project: 'KD Antriksh Residency', budget: '10-25 lakh', visit_date: '2026-12-01', page_url: 'https://khushiideveloper.com/', external_id: 'site-123' });
  const remarks = websiteLeadRemarks(data);
  assert.ok(remarks.includes('Interest: Site Visit'));
  assert.ok(remarks.includes('Website project: KD Antriksh Residency'));
  assert.ok(remarks.includes('Budget: 10-25 lakh'));
  assert.ok(remarks.length < 8000);
  assert.equal(data.external_id, 'site-123');
  assert.throws(() => mapWebsiteLead({ ...data, message: 'x'.repeat(3001) }));
  assert.throws(() => mapWebsiteLead({ ...data, consent: '1' }));
});
