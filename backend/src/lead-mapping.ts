import { HttpError } from './errors.ts';
import { parse, websiteLeadSchema } from './validation.ts';

export const leadFields = ['customer_name', 'mobile', 'email', 'message', 'consent', 'external_id', 'interest', 'project', 'category', 'plot_size', 'budget', 'timeline', 'visit_date', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign'];
const aliases = {
  customer_name: ['customer_name', 'name', 'full_name', 'your-name'],
  mobile: ['mobile', 'phone', 'phone_number', 'telephone', 'your-phone'],
  email: ['email', 'email_address', 'your-email'],
  message: ['message', 'notes', 'enquiry', 'your-message'],
  consent: ['consent'], external_id: ['external_id'],
  interest: ['interest'],
  project: ['project'],
  category: ['category'],
  plot_size: ['plot_size'],
  budget: ['budget'],
  timeline: ['timeline'],
  visit_date: ['visit_date'],
  page_url: ['page_url'],
  utm_source: ['utm_source'],
  utm_medium: ['utm_medium'],
  utm_campaign: ['utm_campaign'],
};
function segments(path) {
  if (typeof path !== 'string' || path.length > 200 || !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+|\[\d+\])*$/.test(path)) throw new HttpError(400, 'INVALID_MAPPING', 'Use property paths such as customer.name or fields[0].value.');
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  if (parts.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) throw new HttpError(400, 'INVALID_MAPPING', 'Unsafe property path.');
  return parts;
}
export function validateMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new HttpError(400, 'INVALID_MAPPING', 'Field mapping must be an object.');
  for (const [field, path] of Object.entries(mapping)) {
    if (!leadFields.includes(field)) throw new HttpError(400, 'INVALID_MAPPING', `Unknown CRM field: ${field}`);
    segments(path);
  }
  return mapping;
}
function readPath(payload, path) {
  return segments(path).reduce((value, part) => value !== null && typeof value === 'object' && Object.hasOwn(value, part) ? value[part] : undefined, payload);
}
export function mapWebsiteLead(payload, mapping = {}) {
  validateMapping(mapping);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError(400, 'INVALID_PAYLOAD', 'Send one lead object per request.');
  const result = {};
  for (const field of leadFields) {
    if (Object.hasOwn(mapping, field)) result[field] = readPath(payload, mapping[field]);
    else {
      const matches = aliases[field].filter((alias) => Object.hasOwn(payload, alias));
      if (matches.length > 1) throw new HttpError(400, 'AMBIGUOUS_FIELD', `Multiple values match ${field}; configure its field mapping.`);
      if (matches.length) result[field] = payload[matches[0]];
    }
    if (field !== 'consent' && result[field] !== undefined && typeof result[field] !== 'string') throw new HttpError(400, 'INVALID_FIELD_TYPE', `${field} must be text. Send phone numbers as strings.`);
  }
  // Consent is never inferred or coerced from truthy strings.
  return parse(websiteLeadSchema, result);
}

// Keep website context with the enquiry, without using untrusted project labels for routing.
export function websiteLeadRemarks(data) {
  const labels = { interest: 'Interest', project: 'Website project', category: 'Enquiry type', plot_size: 'Plot size', budget: 'Budget', timeline: 'Timeline', visit_date: 'Visit date', page_url: 'Page URL', utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'UTM campaign' };
  return [data.message, ...Object.entries(labels).filter(([key]) => data[key]).map(([key, label]) => `${label}: ${data[key]}`)].filter(Boolean).join('\n') || null;
}
