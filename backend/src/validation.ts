import { z } from 'zod';
import { HttpError } from './errors.ts';

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', result.error.issues.map((issue) => issue.message).join(' '));
  }
  return result.data;
}

export const idSchema = z.string().uuid();
export const projectSchema = z.object({
  project_code: z.string().trim().min(1).max(50),
  project_name: z.string().trim().min(1).max(200),
  project_type: z.string().trim().min(1).max(50).optional(),
  total_land_area: z.coerce.number().nonnegative().optional(),
  area_unit: z.string().trim().max(20).optional(),
  survey_number: z.string().trim().max(100).optional(),
  village: z.string().trim().max(150).optional(),
  taluka: z.string().trim().max(150).optional(),
  district: z.string().trim().max(150).optional(),
  state: z.string().trim().max(100).optional(),
  pincode: z.string().trim().max(10).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  description: z.string().max(5000).optional(),
  highlights: z.array(z.string().trim().min(1).max(180)).max(20).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});
export const plotSchema = z.object({
  plot_number: z.string().trim().min(1).max(50),
  plot_type: z.string().trim().max(50).optional(),
  area_sq_yard: z.coerce.number().nonnegative().optional(),
  area_sq_feet: z.coerce.number().nonnegative().optional(),
  length: z.coerce.number().nonnegative().optional(),
  width: z.coerce.number().nonnegative().optional(),
  direction: z.string().trim().max(20).optional(),
  road_width: z.coerce.number().nonnegative().optional(),
  north_boundary: z.string().trim().max(100).optional(),
  south_boundary: z.string().trim().max(100).optional(),
  east_boundary: z.string().trim().max(100).optional(),
  west_boundary: z.string().trim().max(100).optional(),
  current_price: z.coerce.number().nonnegative().optional(),
});
export const plotUpdateSchema = plotSchema.partial().extend({
  status: z.enum(['AVAILABLE', 'BLOCKED']).optional(),
});
export const projectCreateSchema = projectSchema.extend({
  initial_plots: z.array(plotSchema).max(500).optional(),
});
export const userSchema = z.object({
  full_name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(255),
  mobile: z.string().trim().max(20).optional(),
  password: z.string().min(12).max(200).refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must not exceed 72 UTF-8 bytes.',
  ),
  role: z.enum(['ADMIN', 'PROJECT_MANAGER', 'SALES_MANAGER', 'SALES_EXECUTIVE', 'BROKER', 'ACCOUNTS']),
  project_ids: z.array(idSchema).default([]),
});
export const userUpdateSchema = userSchema.partial().extend({
  is_active: z.boolean().optional(),
});
export const publicBookingSchema = z.object({
  project_id: idSchema,
  plot_id: idSchema,
  customer: z.object({
    name: z.string().trim().min(1).max(150),
    mobile: z.string().trim().regex(/^[+()\d\s-]{7,20}$/),
    email: z.union([z.string().trim().email().max(255), z.literal('')]).optional(),
  }),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
});
export const crmBookingSchema = z.object({
  plot_id: idSchema,
  customer: z.object({
    full_name: z.string().trim().min(1).max(150),
    mobile: z.string().trim().regex(/^[+()\d\s-]{7,20}$/),
    email: z.union([z.string().trim().email().max(255), z.literal('')]).optional(),
    booking_amount: z.coerce.number().nonnegative().optional(),
  }),
  remarks: z.string().trim().max(1000).optional(),
});
