import './env.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, inTransaction } from './db.ts';
import { authenticate, permissionsFor, requireProjectAccess } from './auth.ts';
import { HttpError, asyncHandler } from './errors.ts';
import { inventoryEvents, publishInventoryEvent } from './realtime.ts';
import { crmBookingSchema, idSchema, parse, plotSchema, projectCreateSchema, projectSchema, publicBookingSchema, userSchema, userUpdateSchema } from './validation.ts';

const app = express();
const api = express.Router();
const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uploadDirectory = path.join(backendDirectory, 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: { directives: { styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'blob:', 'data:'] } },
}));
const allowedOrigins = process.env.PUBLIC_WEB_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? false;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.get('/', (_req, res) => {
  res.json({ service: 'EstateDesk API', health: '/api/v1/health' });
});
app.get('/uploads/:filename', asyncHandler(async (req, res) => {
  const { filename } = req.params;
  if (!/^[\da-f-]{36}\.(jpg|png|webp)$/i.test(filename)) throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found.');
  const imageUrl = `/uploads/${filename}`;
  const result = await pool.query(
    `SELECT l.project_id, l.status AS layout_status, p.status AS project_status
     FROM layouts l JOIN projects p ON p.id = l.project_id WHERE l.image_url = $1`,
    [imageUrl],
  );
  if (!result.rowCount) throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found.');
  const layout = result.rows[0];
  const publiclyPublished = layout.layout_status === 'PUBLISHED' && layout.project_status === 'ACTIVE';
  if (!publiclyPublished) {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to view this project layout.');
    let user;
    try { user = jwt.verify(token, process.env.JWT_SECRET); }
    catch { throw new HttpError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired.'); }
    const account = await pool.query('SELECT role, is_active, token_version FROM users WHERE id = $1', [user.id]);
    if (!account.rowCount || !account.rows[0].is_active) throw new HttpError(401, 'ACCOUNT_DISABLED', 'This account is unavailable.');
    if (user.token_version !== account.rows[0].token_version) throw new HttpError(401, 'SESSION_REVOKED', 'Your session has been revoked. Sign in again.');
    user.role = account.rows[0].role;
    await requireProjectAccess(user, layout.project_id, pool);
    res.set('Cache-Control', 'private, no-store');
  } else {
    res.set('Cache-Control', 'public, max-age=3600');
  }
  res.type(path.extname(filename));
  res.sendFile(path.join(uploadDirectory, filename));
}));
app.use('/api/v1', api);

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDirectory),
    filename: (_req, file, callback) => {
      const extension = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype];
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new HttpError(400, 'INVALID_FILE_TYPE', 'Upload a JPEG, PNG, or WebP layout image.'));
      return;
    }
    callback(null, true);
  },
});

function validateImageContents(req, _res, next) {
  if (!req.file) return next();
  const header = fs.readFileSync(req.file.path).subarray(0, 12);
  const valid = req.file.mimetype === 'image/jpeg'
    ? header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    : req.file.mimetype === 'image/png'
      ? header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) {
    fs.unlinkSync(req.file.path);
    return next(new HttpError(400, 'INVALID_FILE_CONTENT', 'The uploaded file content does not match its image type.'));
  }
  next();
}

function authRoute(handler) {
  return [authenticate, asyncHandler(handler)];
}

function respondError(error, _req, res, _next) {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ success: false, error: { code: 'UPLOAD_ERROR', message: error.message } });
    return;
  }
  const status = error.status ?? (error.code === '23505' ? 409 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    success: false,
    error: {
      code: error.code === '23505' ? 'CONFLICT' : error.code ?? 'INTERNAL_ERROR',
      message: status >= 500 ? 'An unexpected error occurred.' : error.message,
    },
  });
}

api.get('/health', asyncHandler(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ success: true, data: { status: 'ok', database: 'connected' } });
}));

api.post('/auth/login', publicLimiter, asyncHandler(async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  if (!email || !password || Buffer.byteLength(password, 'utf8') > 72) throw new HttpError(400, 'VALIDATION_ERROR', 'Email and a valid password are required.');
  const result = await pool.query(
    'SELECT id, full_name, email, password_hash, role, is_active, token_version FROM users WHERE lower(email) = $1',
    [email],
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email, token_version: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '2h' },
  );
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id, ip_address) VALUES ($1, $2, $3, $4, $1, $5)',
    [user.id, 'LOGIN', 'auth', 'user', req.ip],
  );
  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role, permissions: permissionsFor(user.role) },
    },
  });
}));

api.get('/auth/me', ...authRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT id, full_name, email, mobile, role FROM users WHERE id = $1 AND is_active = TRUE',
    [req.user.id],
  );
  if (!result.rowCount) throw new HttpError(401, 'ACCOUNT_DISABLED', 'This account is unavailable.');
  res.json({ success: true, data: { ...result.rows[0], permissions: permissionsFor(result.rows[0].role) } });
}));

api.post('/auth/logout', ...authRoute(async (req, res) => {
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id]);
  await pool.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'LOGOUT', 'auth', 'user', req.user.id]);
  res.status(204).end();
}));

api.get('/users', ...authRoute(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Only an administrator can manage users.');
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.mobile, u.role, u.is_active, u.created_at,
      COALESCE(array_agg(up.project_id) FILTER (WHERE up.project_id IS NOT NULL), '{}') AS project_ids,
      COALESCE(array_agg(p.project_name) FILTER (WHERE p.id IS NOT NULL), '{}') AS project_names
     FROM users u LEFT JOIN user_projects up ON up.user_id = u.id
     LEFT JOIN projects p ON p.id = up.project_id GROUP BY u.id ORDER BY u.created_at DESC`,
  );
  res.json({ success: true, data: result.rows });
}));

api.post('/users', ...authRoute(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Only an administrator can create users.');
  const data = parse(userSchema, req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const created = await inTransaction(async (client) => {
    if (data.project_ids.length) {
      const projects = await client.query('SELECT id FROM projects WHERE id = ANY($1::uuid[])', [data.project_ids]);
      if (projects.rowCount !== data.project_ids.length) throw new HttpError(400, 'INVALID_PROJECT', 'One or more assigned projects do not exist.');
    }
    const user = await client.query(
      `INSERT INTO users (full_name, email, mobile, password_hash, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name, email, mobile, role, is_active`,
      [data.full_name, data.email.toLowerCase(), data.mobile ?? null, passwordHash, data.role],
    );
    for (const projectId of data.project_ids) {
      await client.query('INSERT INTO user_projects (user_id, project_id, assigned_by) VALUES ($1,$2,$3)', [user.rows[0].id, projectId, req.user.id]);
    }
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'USER_CREATED', 'users', 'user', user.rows[0].id]);
    return user.rows[0];
  });
  res.status(201).json({ success: true, data: created });
}));

api.patch('/users/:userId', ...authRoute(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'FORBIDDEN', 'Only an administrator can update users.');
  const userId = parse(idSchema, req.params.userId);
  if (userId === req.user.id && req.body.is_active === false) throw new HttpError(400, 'SELF_DEACTIVATION_DENIED', 'You cannot deactivate your own account.');
  const data = parse(userUpdateSchema, req.body);
  const { project_ids: projectIds, password, ...userFields } = data;
  const result = await inTransaction(async (client) => {
    const user = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
    const fields = Object.entries(userFields);
    if (password) fields.push(['password_hash', await bcrypt.hash(password, 12)]);
    if (fields.length) {
      const assignments = fields.map(([key], index) => `${key} = $${index + 2}`).join(', ');
      await client.query(`UPDATE users SET ${assignments}, token_version = token_version + 1, updated_at = NOW() WHERE id = $1`, [userId, ...fields.map(([, value]) => value)]);
    }
    if (projectIds) {
      const projects = await client.query('SELECT id FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
      if (projects.rowCount !== projectIds.length) throw new HttpError(400, 'INVALID_PROJECT', 'One or more assigned projects do not exist.');
      await client.query('DELETE FROM user_projects WHERE user_id = $1', [userId]);
      for (const projectId of projectIds) {
        await client.query('INSERT INTO user_projects (user_id, project_id, assigned_by) VALUES ($1,$2,$3)', [userId, projectId, req.user.id]);
      }
    }
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'USER_UPDATED', 'users', 'user', userId]);
    return client.query('SELECT id, full_name, email, mobile, role, is_active FROM users WHERE id = $1', [userId]);
  });
  res.json({ success: true, data: result.rows[0] });
}));

api.get('/dashboard', ...authRoute(async (req, res) => {
  const projectFilter = req.user.role === 'ADMIN'
    ? ''
    : 'WHERE p.id IN (SELECT project_id FROM user_projects WHERE user_id = $1)';
  const values = req.user.role === 'ADMIN' ? [] : [req.user.id];
  const [projects, plots, bookings, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total FROM projects p ${projectFilter}`, values),
    pool.query(
      `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE p.status = 'AVAILABLE')::int AS available,
        count(*) FILTER (WHERE p.status = 'HOLD')::int AS hold,
        count(*) FILTER (WHERE p.status IN ('PENDING_APPROVAL','BOOKED'))::int AS booked
       FROM plots p WHERE ($1::uuid IS NULL OR p.project_id IN
         (SELECT project_id FROM user_projects WHERE user_id = $1) OR $2::boolean)`,
      [req.user.role === 'ADMIN' ? null : req.user.id, req.user.role === 'ADMIN'],
    ),
    pool.query(
      `SELECT count(*)::int AS pending FROM bookings b
       JOIN plots p ON p.id = b.plot_id
       WHERE b.booking_status = 'PENDING_APPROVAL'
       AND ($1::boolean OR p.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2))`,
      [req.user.role === 'ADMIN', req.user.id],
    ),
    pool.query(
      `SELECT a.action, a.module, a.created_at, u.full_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE $1::boolean OR a.user_id = $2
         OR (a.entity_type = 'project' AND a.entity_id IN
           (SELECT project_id FROM user_projects WHERE user_id = $2))
         OR (a.entity_type = 'plot' AND EXISTS (SELECT 1 FROM plots p WHERE p.id = a.entity_id
           AND p.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2)))
         OR (a.entity_type = 'booking' AND EXISTS (SELECT 1 FROM bookings b JOIN plots p ON p.id = b.plot_id
           WHERE b.id = a.entity_id AND p.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2)))
         OR (a.entity_type = 'lead' AND EXISTS (SELECT 1 FROM leads l WHERE l.id = a.entity_id
           AND l.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2)
           AND ($3::boolean OR l.assigned_user_id = $2 OR l.broker_id = $2)))
       ORDER BY a.created_at DESC LIMIT 8`,
      [req.user.role === 'ADMIN', req.user.id, !['BROKER', 'SALES_EXECUTIVE'].includes(req.user.role)],
    ),
  ]);
  res.json({
    success: true,
    data: {
      projects: projects.rows[0].total,
      ...plots.rows[0],
      pending_bookings: bookings.rows[0].pending,
      recent_activity: recent.rows,
    },
  });
}));

api.get('/projects', ...authRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT p.*, count(pl.id)::int AS total_plots,
      count(pl.id) FILTER (WHERE pl.status = 'AVAILABLE')::int AS available_plots,
      count(pl.id) FILTER (WHERE pl.status = 'BOOKED')::int AS booked_plots
     FROM projects p LEFT JOIN plots pl ON pl.project_id = p.id
     WHERE ($1::boolean OR p.id IN (SELECT project_id FROM user_projects WHERE user_id = $2))
     GROUP BY p.id ORDER BY p.created_at DESC`,
    [req.user.role === 'ADMIN', req.user.id],
  );
  res.json({ success: true, data: result.rows });
}));

api.post('/projects', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).includes('*')) throw new HttpError(403, 'FORBIDDEN', 'Only an administrator can create projects.');
  const { initial_plots: initialPlots = [], ...data } = parse(projectCreateSchema, req.body);
  if (data.project_code.startsWith('DEMO-') && data.status !== 'INACTIVE') {
    throw new HttpError(400, 'DEMO_PROJECT_INACTIVE', 'Projects using the DEMO- code prefix must remain inactive.');
  }
  if ((data.latitude === undefined) !== (data.longitude === undefined)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Latitude and longitude must be provided together.');
  }
  const project = await inTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO projects
        (project_code, project_name, survey_number, village, district, state, description, project_type,
         total_land_area, area_unit, taluka, pincode, latitude, longitude, status, highlights)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        data.project_code, data.project_name, data.survey_number ?? null, data.village ?? null,
        data.district ?? null, data.state ?? null, data.description ?? null, data.project_type ?? 'RESIDENTIAL',
        data.total_land_area ?? null, data.area_unit ?? 'ACRE', data.taluka ?? null, data.pincode ?? null,
        data.latitude ?? null, data.longitude ?? null, data.status ?? 'ACTIVE', data.highlights ?? [],
      ],
    );
    const createdProject = result.rows[0];
    if (initialPlots.length) {
      const plots = await client.query(
        `INSERT INTO plots
          (project_id, plot_number, plot_type, area_sq_yard, area_sq_feet, length, width, direction, road_width, current_price)
         SELECT $1, input.plot_number, COALESCE(input.plot_type, 'RESIDENTIAL'),
           COALESCE(input.area_sq_yard, 0), COALESCE(input.area_sq_feet, 0), input.length, input.width,
           input.direction, input.road_width, COALESCE(input.current_price, 0)
         FROM jsonb_to_recordset($2::jsonb) AS input(
           plot_number text, plot_type text, area_sq_yard numeric, area_sq_feet numeric,
           length numeric, width numeric, direction text, road_width numeric, current_price numeric
         )
         RETURNING id`,
        [createdProject.id, JSON.stringify(initialPlots)],
      );
      const plotIds = plots.rows.map((plot) => plot.id);
      await client.query(
        `INSERT INTO plot_status_history (plot_id, new_status, changed_by, reason)
         SELECT plot_id, 'AVAILABLE', $2, 'Plot created with project'
         FROM unnest($1::uuid[]) AS created(plot_id)`,
        [plotIds, req.user.id],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id)
         SELECT $1, 'PLOT_CREATED', 'inventory', 'plot', plot_id
         FROM unnest($2::uuid[]) AS created(plot_id)`,
        [req.user.id, plotIds],
      );
    }
    await client.query(
      'INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'PROJECT_CREATED', 'projects', 'project', createdProject.id],
    );
    return createdProject;
  });
  res.status(201).json({ success: true, data: project });
}));

api.patch('/projects/:projectId', ...authRoute(async (req, res) => {
  if (!['ADMIN', 'PROJECT_MANAGER'].includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'You cannot update projects.');
  const projectId = parse(idSchema, req.params.projectId);
  await requireProjectAccess(req.user, projectId, pool);
  const data = parse(projectSchema.partial(), req.body);
  const currentProject = await pool.query('SELECT project_code FROM projects WHERE id = $1', [projectId]);
  if (currentProject.rows[0]?.project_code.startsWith('DEMO-')
    && (data.project_code !== undefined || (data.status !== undefined && data.status !== 'INACTIVE'))) {
    throw new HttpError(400, 'DEMO_PROJECT_INACTIVE', 'Demo projects must keep their DEMO- code and remain inactive. Create a separate project for real inventory.');
  }
  if (data.latitude !== undefined && data.longitude === undefined) throw new HttpError(400, 'VALIDATION_ERROR', 'Longitude is required when latitude is provided.');
  if (data.longitude !== undefined && data.latitude === undefined) throw new HttpError(400, 'VALIDATION_ERROR', 'Latitude is required when longitude is provided.');
  const fields = Object.entries(data);
  if (!fields.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Provide at least one project field to update.');
  const assignments = fields.map(([key], index) => `${key} = $${index + 2}`).join(', ');
  const result = await pool.query(`UPDATE projects SET ${assignments}, updated_at = NOW() WHERE id = $1 RETURNING *`, [projectId, ...fields.map(([, value]) => value)]);
  if (!result.rowCount) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  await pool.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'PROJECT_UPDATED', 'projects', 'project', projectId]);
  res.json({ success: true, data: result.rows[0] });
}));

api.get('/projects/:projectId/plots', ...authRoute(async (req, res) => {
  parse(idSchema, req.params.projectId);
  await requireProjectAccess(req.user, req.params.projectId, pool);
  const result = await pool.query(
    `SELECT pl.* FROM plots pl WHERE pl.project_id = $1 ORDER BY pl.plot_number`,
    [req.params.projectId],
  );
  res.json({ success: true, data: result.rows });
}));

api.post('/projects/:projectId/plots', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'inventory:write')) {
    throw new HttpError(403, 'FORBIDDEN', 'You cannot create plots.');
  }
  parse(idSchema, req.params.projectId);
  await requireProjectAccess(req.user, req.params.projectId, pool);
  const data = parse(plotSchema, req.body);
  const plot = await inTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO plots (project_id, plot_number, plot_type, area_sq_yard, area_sq_feet, length, width, direction, road_width, current_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.projectId, data.plot_number, data.plot_type ?? 'RESIDENTIAL', data.area_sq_yard ?? 0, data.area_sq_feet ?? 0, data.length ?? null, data.width ?? null, data.direction ?? null, data.road_width ?? null, data.current_price ?? 0],
    );
    await client.query(
      `INSERT INTO plot_status_history (plot_id, new_status, changed_by, reason)
       VALUES ($1,'AVAILABLE',$2,'Plot created')`,
      [result.rows[0].id, req.user.id],
    );
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'PLOT_CREATED', 'inventory', 'plot', result.rows[0].id]);
    return result.rows[0];
  });
  publishInventoryEvent(req.params.projectId, 'plot.created', { plot_id: plot.id, plot_number: plot.plot_number });
  res.status(201).json({ success: true, data: plot });
}));

api.patch('/plots/:plotId', ...authRoute(async (req, res) => {
  const plotId = parse(idSchema, req.params.plotId);
  const result = await pool.query('SELECT * FROM plots WHERE id = $1', [plotId]);
  if (!result.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found.');
  const current = result.rows[0];
  await requireProjectAccess(req.user, current.project_id, pool);
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'inventory:write')) throw new HttpError(403, 'FORBIDDEN', 'You cannot update this plot.');
  const data = parse(plotSchema.partial(), req.body);
  const allowed = ['plot_number', 'plot_type', 'area_sq_yard', 'area_sq_feet', 'length', 'width', 'direction', 'road_width', 'current_price'];
  const fields = Object.entries(data).filter(([key]) => allowed.includes(key));
  if (!fields.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Provide at least one plot field to update.');
  const values = fields.map(([, value]) => value);
  const assignments = fields.map(([key], index) => `${key} = $${index + 2}`).join(', ');
  const updated = await pool.query(`UPDATE plots SET ${assignments}, updated_at = NOW() WHERE id = $1 RETURNING *`, [plotId, ...values]);
  await pool.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'PLOT_UPDATED', 'inventory', 'plot', plotId]);
  publishInventoryEvent(current.project_id, 'plot.updated', { plot_id: plotId, plot_number: updated.rows[0].plot_number });
  res.json({ success: true, data: updated.rows[0] });
}));

api.post('/plots/:plotId/hold', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'inventory:write')) throw new HttpError(403, 'FORBIDDEN', 'You cannot place a hold.');
  const plotId = parse(idSchema, req.params.plotId);
  const holdDuration = Number(process.env.HOLD_DURATION_MINUTES ?? 30);
  const plot = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM plots WHERE id = $1 FOR UPDATE', [plotId]);
    if (!found.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found.');
    const current = found.rows[0];
    await requireProjectAccess(req.user, current.project_id, client);
    if (!['AVAILABLE', 'HOLD'].includes(current.status)) throw new HttpError(409, 'PLOT_NOT_AVAILABLE', 'This plot is not available.');
    const holdExpired = current.status === 'HOLD' && current.hold_expires_at <= new Date();
    if (current.status === 'HOLD' && !holdExpired && current.held_by !== req.user.id) {
      throw new HttpError(409, 'PLOT_HELD', 'This plot is currently held by another user.');
    }
    if (holdExpired) {
      await client.query(
        `INSERT INTO plot_status_history (plot_id, previous_status, new_status, changed_by, reason)
         VALUES ($1,'HOLD','AVAILABLE',$2,'Temporary hold expired before renewal')`,
        [plotId, req.user.id],
      );
    }
    const updated = await client.query(
      `UPDATE plots SET status = 'HOLD', held_by = $2,
       hold_expires_at = NOW() + ($3 * INTERVAL '1 minute'), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [plotId, req.user.id, holdDuration],
    );
    await client.query(
      `INSERT INTO plot_status_history (plot_id, previous_status, new_status, changed_by, reason)
       VALUES ($1,$2,'HOLD',$3,'Temporary hold created')`,
      [plotId, holdExpired ? 'AVAILABLE' : current.status, req.user.id],
    );
    await client.query(
      'INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'PLOT_HELD', 'inventory', 'plot', plotId],
    );
    return updated.rows[0];
  });
  publishInventoryEvent(plot.project_id, 'plot.hold.created', { plot_id: plot.id, plot_number: plot.plot_number, status: plot.status, hold_expires_at: plot.hold_expires_at });
  res.status(201).json({ success: true, data: plot });
}));

api.post('/plots/:plotId/release-hold', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'inventory:write')) throw new HttpError(403, 'FORBIDDEN', 'You cannot release plot holds.');
  const plotId = parse(idSchema, req.params.plotId);
  const plot = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM plots WHERE id = $1 FOR UPDATE', [plotId]);
    if (!found.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found.');
    const current = found.rows[0];
    await requireProjectAccess(req.user, current.project_id, client);
    if (current.status !== 'HOLD') throw new HttpError(409, 'INVALID_PLOT_STATE', 'This plot does not have an active hold.');
    if (current.held_by !== req.user.id && !['ADMIN', 'PROJECT_MANAGER', 'SALES_MANAGER'].includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'Only the hold owner or a manager can release this hold.');
    const updated = await client.query(
      `UPDATE plots SET status = 'AVAILABLE', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [plotId],
    );
    await client.query('INSERT INTO plot_status_history (plot_id, previous_status, new_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)', [plotId, current.status, 'AVAILABLE', req.user.id, 'Hold released']);
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'PLOT_HOLD_RELEASED', 'inventory', 'plot', plotId]);
    return updated.rows[0];
  });
  publishInventoryEvent(plot.project_id, 'plot.status.updated', { plot_id: plot.id, plot_number: plot.plot_number, status: 'AVAILABLE' });
  res.json({ success: true, data: plot });
}));

api.get('/plots/:plotId/history', ...authRoute(async (req, res) => {
  const plotId = parse(idSchema, req.params.plotId);
  const plot = await pool.query('SELECT project_id FROM plots WHERE id = $1', [plotId]);
  if (!plot.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found.');
  await requireProjectAccess(req.user, plot.rows[0].project_id, pool);
  const history = await pool.query(
    `SELECT h.*, u.full_name AS changed_by_name FROM plot_status_history h
     LEFT JOIN users u ON u.id = h.changed_by WHERE h.plot_id = $1
     ORDER BY h.created_at DESC LIMIT 100`,
    [plotId],
  );
  res.json({ success: true, data: history.rows });
}));

api.get('/projects/:projectId/layouts', ...authRoute(async (req, res) => {
  parse(idSchema, req.params.projectId);
  await requireProjectAccess(req.user, req.params.projectId, pool);
  const result = await pool.query(
    `SELECT l.*, COALESCE(json_agg(json_build_object(
       'plot_id', pl.plot_id, 'plot_number', p.plot_number, 'geometry', pl.geometry,
       'status', p.status, 'area_sq_yard', p.area_sq_yard
     ) ORDER BY pl.display_order) FILTER (WHERE pl.id IS NOT NULL), '[]') AS plots
     FROM layouts l LEFT JOIN plot_layouts pl ON pl.layout_id = l.id
     LEFT JOIN plots p ON p.id = pl.plot_id WHERE l.project_id = $1
     GROUP BY l.id ORDER BY l.version_number DESC`,
    [req.params.projectId],
  );
  res.json({ success: true, data: result.rows });
}));

async function createLayout(req, res) {
  if (!['ADMIN', 'PROJECT_MANAGER'].includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'You cannot upload project layouts.');
  parse(idSchema, req.params.projectId);
  await requireProjectAccess(req.user, req.params.projectId, pool);
  const layout = await inTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO layouts (project_id, layout_name, image_url, image_width, image_height, version_number, created_by)
       SELECT $1, $2, $3, $4, $5, COALESCE(MAX(version_number), 0) + 1, $6
       FROM layouts WHERE project_id = $1 RETURNING *`,
      [req.params.projectId, req.body.layout_name ?? 'Project layout', req.file ? `/uploads/${req.file.filename}` : null, Number(req.body.image_width) || null, Number(req.body.image_height) || null, req.user.id],
    );
    const previous = await client.query(
      `SELECT id FROM layouts WHERE project_id = $1 AND status IN ('DRAFT','PUBLISHED')
       ORDER BY version_number DESC LIMIT 1`,
      [req.params.projectId],
    );
    if (previous.rowCount) {
      await client.query(
        `INSERT INTO plot_layouts (layout_id, plot_id, geometry, label_position, display_order)
         SELECT $1, plot_id, geometry, label_position, display_order
         FROM plot_layouts WHERE layout_id = $2`,
        [result.rows[0].id, previous.rows[0].id],
      );
    }
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'LAYOUT_DRAFT_CREATED', 'layouts', 'layout', result.rows[0].id]);
    return result.rows[0];
  });
  res.status(201).json({ success: true, data: layout });
}

api.post('/projects/:projectId/layouts', ...authRoute(createLayout));
api.post('/projects/:projectId/layouts/revisions', ...authRoute(createLayout));

api.post('/projects/:projectId/layouts/upload', authenticate, imageUpload.single('image'), validateImageContents, asyncHandler(createLayout));

api.put('/layouts/:layoutId/plots/:plotId', ...authRoute(async (req, res) => {
  if (!['ADMIN', 'PROJECT_MANAGER'].includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'You cannot edit layout boundaries.');
  const layoutId = parse(idSchema, req.params.layoutId);
  const plotId = parse(idSchema, req.params.plotId);
  const geometry = req.body.geometry;
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates?.[0]) || geometry.coordinates[0].length < 4) {
    throw new HttpError(400, 'INVALID_GEOMETRY', 'Provide a polygon with at least three boundary points and a closing point.');
  }
  const layout = await pool.query('SELECT project_id FROM layouts WHERE id = $1', [layoutId]);
  if (!layout.rowCount) throw new HttpError(404, 'LAYOUT_NOT_FOUND', 'Layout not found.');
  await requireProjectAccess(req.user, layout.rows[0].project_id, pool);
  const draft = await pool.query('SELECT status FROM layouts WHERE id = $1', [layoutId]);
  if (draft.rows[0].status !== 'DRAFT') throw new HttpError(409, 'LAYOUT_NOT_DRAFT', 'Create a draft layout revision before editing published boundaries.');
  const plot = await pool.query('SELECT 1 FROM plots WHERE id = $1 AND project_id = $2', [plotId, layout.rows[0].project_id]);
  if (!plot.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot does not belong to this project.');
  const normalized = geometry.coordinates[0].every((point) => Array.isArray(point) && point.length === 2 && point.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1));
  if (!normalized) throw new HttpError(400, 'INVALID_GEOMETRY', 'Polygon coordinates must be normalized between 0 and 1.');
  const result = await pool.query(
    `INSERT INTO plot_layouts (layout_id, plot_id, geometry)
     VALUES ($1,$2,$3) ON CONFLICT (layout_id, plot_id)
     DO UPDATE SET geometry = EXCLUDED.geometry RETURNING *`,
    [layoutId, plotId, JSON.stringify(geometry)],
  );
  await pool.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'LAYOUT_BOUNDARY_UPDATED', 'layouts', 'layout', layoutId]);
  res.json({ success: true, data: result.rows[0] });
}));

api.post('/layouts/:layoutId/publish', ...authRoute(async (req, res) => {
  if (!['ADMIN', 'PROJECT_MANAGER'].includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'You cannot publish layouts.');
  const layoutId = parse(idSchema, req.params.layoutId);
  const result = await inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM layouts WHERE id = $1 FOR UPDATE', [layoutId]);
    if (!found.rowCount) throw new HttpError(404, 'LAYOUT_NOT_FOUND', 'Layout not found.');
    await requireProjectAccess(req.user, found.rows[0].project_id, client);
    await client.query(`UPDATE layouts SET status = 'ARCHIVED' WHERE project_id = $1 AND status = 'PUBLISHED'`, [found.rows[0].project_id]);
    if (found.rows[0].status !== 'DRAFT') throw new HttpError(409, 'LAYOUT_NOT_DRAFT', 'Only a draft layout can be published.');
    const published = await client.query(`UPDATE layouts SET status = 'PUBLISHED', published_by = $2, published_at = NOW() WHERE id = $1 RETURNING *`, [layoutId, req.user.id]);
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'LAYOUT_PUBLISHED', 'layouts', 'layout', layoutId]);
    return published;
  });
  publishInventoryEvent(result.rows[0].project_id, 'layout.published', { layout_id: layoutId, version_number: result.rows[0].version_number });
  res.json({ success: true, data: result.rows[0] });
}));

api.get('/bookings', ...authRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT b.*, p.plot_number, p.project_id, pr.project_name, c.full_name AS customer_name, c.mobile AS customer_mobile
     FROM bookings b JOIN plots p ON p.id = b.plot_id JOIN projects pr ON pr.id = p.project_id
     JOIN customers c ON c.id = b.customer_id
     WHERE ($1::boolean OR p.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2))
       AND ($3::text IS NULL OR b.booking_status = $3)
       AND ($4::boolean OR b.submitted_by = $2 OR b.salesperson_id = $2 OR b.broker_id = $2)
     ORDER BY b.submitted_at DESC LIMIT 100`,
    [req.user.role === 'ADMIN', req.user.id, req.query.status ?? null, !['BROKER', 'SALES_EXECUTIVE'].includes(req.user.role)],
  );
  res.json({ success: true, data: result.rows });
}));

async function submitBooking({ plotId, userId, customer, remarks = '', source = 'CRM' }) {
  return inTransaction(async (client) => {
    const found = await client.query('SELECT * FROM plots WHERE id = $1 FOR UPDATE', [plotId]);
    if (!found.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found.');
    const plot = found.rows[0];
    if (userId) await requireProjectAccess({ ...customer, id: userId, role: customer.role }, plot.project_id, client);
    const holdExpired = plot.status === 'HOLD' && plot.hold_expires_at <= new Date();
    if (holdExpired) {
      await client.query(
        `UPDATE plots SET status='AVAILABLE', held_by=NULL, hold_expires_at=NULL, updated_at=NOW()
         WHERE id = $1`,
        [plotId],
      );
      await client.query(
        `INSERT INTO plot_status_history (plot_id, previous_status, new_status, changed_by, reason)
         VALUES ($1,'HOLD','AVAILABLE',$2,'Temporary hold expired before booking')`,
        [plotId, userId],
      );
      plot.status = 'AVAILABLE';
      plot.held_by = null;
      plot.hold_expires_at = null;
    }
    const ownsActiveHold = userId && plot.status === 'HOLD' && plot.held_by === userId && plot.hold_expires_at > new Date();
    if (plot.status !== 'AVAILABLE' && !ownsActiveHold) throw new HttpError(409, 'PLOT_NOT_AVAILABLE', 'This plot is no longer available.');
    let customerId = customer.id;
    if (!customerId) {
      const matched = await client.query('SELECT id FROM customers WHERE mobile = $1', [customer.mobile]);
      if (matched.rowCount) customerId = matched.rows[0].id;
      else {
        const inserted = await client.query(
          'INSERT INTO customers (full_name, mobile, email) VALUES ($1,$2,$3) RETURNING id',
          [customer.full_name, customer.mobile, customer.email ?? null],
        );
        customerId = inserted.rows[0].id;
      }
    }
    const updated = await client.query(
      `UPDATE plots SET status = 'PENDING_APPROVAL', held_by = NULL, hold_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND status IN ('AVAILABLE','HOLD') RETURNING id`,
      [plotId],
    );
    if (!updated.rowCount) throw new HttpError(409, 'PLOT_NOT_AVAILABLE', 'This plot is no longer available.');
    const booking = await client.query(
      `INSERT INTO bookings (plot_id, customer_id, submitted_by, salesperson_id, total_price, booking_amount, booking_status, remarks, source)
       VALUES ($1,$2,$3,$3,$4,$5,'PENDING_APPROVAL',$6,$7) RETURNING *`,
      [plotId, customerId, userId, plot.current_price, Number(customer.booking_amount ?? 0), remarks, source],
    );
    await client.query(
      `INSERT INTO plot_status_history (plot_id, previous_status, new_status, changed_by, reason, reference_type, reference_id)
       VALUES ($1,$2,'PENDING_APPROVAL',$3,'Booking submitted','booking',$4)`,
      [plotId, plot.status, userId, booking.rows[0].id],
    );
    await client.query(
      'INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)',
      [userId, 'BOOKING_SUBMITTED', 'bookings', 'booking', booking.rows[0].id],
    );
    return { booking: booking.rows[0], projectId: plot.project_id, plotNumber: plot.plot_number };
  });
}

api.post('/bookings', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'bookings:write')) throw new HttpError(403, 'FORBIDDEN', 'You cannot submit bookings.');
  const data = parse(crmBookingSchema, req.body);
  const plotId = data.plot_id;
  const result = await submitBooking({
    plotId,
    userId: req.user.id,
    customer: { ...data.customer, role: req.user.role },
    remarks: data.remarks ?? '',
  });
  publishInventoryEvent(result.projectId, 'booking.submitted', { booking_id: result.booking.id, plot_id: plotId, plot_number: result.plotNumber });
  res.status(201).json({ success: true, data: result.booking });
}));

async function decideBooking(req, decision) {
  if (!['ADMIN', 'PROJECT_MANAGER', 'SALES_MANAGER'].includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'Only a manager can decide a booking.');
  const bookingId = parse(idSchema, req.params.bookingId);
  return inTransaction(async (client) => {
    const found = await client.query(
      `SELECT b.*, p.project_id, p.plot_number, p.status AS plot_status FROM bookings b
       JOIN plots p ON p.id = b.plot_id WHERE b.id = $1 FOR UPDATE OF b, p`,
      [bookingId],
    );
    if (!found.rowCount) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    const booking = found.rows[0];
    await requireProjectAccess(req.user, booking.project_id, client);
    if (booking.booking_status !== 'PENDING_APPROVAL') throw new HttpError(409, 'INVALID_BOOKING_STATE', 'This booking has already been processed.');
    if (booking.submitted_by === req.user.id && req.user.role !== 'ADMIN') throw new HttpError(403, 'SELF_APPROVAL_DENIED', 'You cannot approve or reject your own booking.');
    const status = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    await client.query('UPDATE bookings SET booking_status = $2, approved_by = $3, approved_at = NOW(), rejection_reason = $4, updated_at = NOW() WHERE id = $1', [bookingId, status, req.user.id, decision === 'reject' ? (req.body.reason ?? 'Booking rejected') : null]);
    await client.query('INSERT INTO booking_approvals (booking_id, approver_id, decision, remarks) VALUES ($1,$2,$3,$4)', [bookingId, req.user.id, status, req.body.reason ?? null]);
    await client.query(`UPDATE plots SET status = $2, updated_at = NOW() WHERE id = $1`, [booking.plot_id, decision === 'approve' ? 'BOOKED' : 'AVAILABLE']);
    await client.query('INSERT INTO plot_status_history (plot_id, previous_status, new_status, changed_by, reason, reference_type, reference_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [booking.plot_id, booking.plot_status, decision === 'approve' ? 'BOOKED' : 'AVAILABLE', req.user.id, `Booking ${status.toLowerCase()}`, 'booking', bookingId]);
    await client.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, `BOOKING_${status}`, 'bookings', 'booking', bookingId]);
    return { booking_id: bookingId, project_id: booking.project_id, plot_id: booking.plot_id, plot_number: booking.plot_number, booking_status: status };
  });
}

api.post('/bookings/:bookingId/approve', ...authRoute(async (req, res) => {
  const result = await decideBooking(req, 'approve');
  publishInventoryEvent(result.project_id, 'booking.approved', result);
  res.json({ success: true, data: result });
}));

api.post('/bookings/:bookingId/reject', ...authRoute(async (req, res) => {
  const result = await decideBooking(req, 'reject');
  publishInventoryEvent(result.project_id, 'booking.rejected', result);
  res.json({ success: true, data: result });
}));

api.get('/customers', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'customers:read')) throw new HttpError(403, 'FORBIDDEN', 'You cannot view customers.');
  const result = await pool.query(
    `SELECT DISTINCT c.* FROM customers c
     WHERE ($1::boolean OR EXISTS (
       SELECT 1 FROM leads l WHERE l.customer_id = c.id
       AND l.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2)
       AND ($3::boolean OR l.assigned_user_id = $2 OR l.broker_id = $2)
     ) OR EXISTS (
       SELECT 1 FROM bookings b JOIN plots p ON p.id = b.plot_id WHERE b.customer_id = c.id
       AND p.project_id IN (SELECT project_id FROM user_projects WHERE user_id = $2)
       AND ($3::boolean OR b.submitted_by = $2 OR b.salesperson_id = $2 OR b.broker_id = $2)
     ))
     ORDER BY c.created_at DESC LIMIT 200`,
    [req.user.role === 'ADMIN', req.user.id, !['BROKER', 'SALES_EXECUTIVE'].includes(req.user.role)],
  );
  res.json({ success: true, data: result.rows });
}));

api.post('/public/enquiries', publicLimiter, asyncHandler(async (req, res) => {
  if (req.body.consent !== true) throw new HttpError(400, 'CONSENT_REQUIRED', 'Customer consent is required.');
  const { customer_name, mobile, email, project_id, plot_id, message } = req.body;
  if (!customer_name || !/^[+()\d\s-]{7,20}$/.test(mobile ?? '') || !project_id) throw new HttpError(400, 'VALIDATION_ERROR', 'A name, valid mobile number, and project are required.');
  parse(idSchema, project_id);
  if (plot_id) parse(idSchema, plot_id);
  const result = await inTransaction(async (client) => {
    const project = await client.query(
      `SELECT p.id FROM projects p WHERE p.id = $1 AND p.status = 'ACTIVE'
       AND EXISTS (SELECT 1 FROM layouts l WHERE l.project_id = p.id AND l.status = 'PUBLISHED')`,
      [project_id],
    );
    if (!project.rowCount) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    if (plot_id) {
      const plot = await client.query('SELECT 1 FROM plots WHERE id = $1 AND project_id = $2', [plot_id, project_id]);
      if (!plot.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found in this project.');
    }
    const existing = await client.query('SELECT id FROM customers WHERE mobile = $1', [mobile.trim()]);
    const customer = existing.rowCount
      ? existing.rows[0]
      : (await client.query('INSERT INTO customers (full_name, mobile, email) VALUES ($1,$2,$3) RETURNING id', [customer_name.trim(), mobile.trim(), email ?? null])).rows[0];
    const assigned = await client.query(
      `SELECT u.id FROM users u JOIN user_projects up ON up.user_id = u.id
       WHERE up.project_id = $1 AND u.is_active = TRUE AND u.role IN ('PROJECT_MANAGER','SALES_MANAGER')
       ORDER BY CASE u.role WHEN 'PROJECT_MANAGER' THEN 0 ELSE 1 END LIMIT 1`,
      [project_id],
    );
    const lead = await client.query(
      `INSERT INTO leads (customer_id, project_id, interested_plot_id, source, lead_status, remarks)
       VALUES ($1,$2,$3,'WEBSITE','NEW',$4) RETURNING id, lead_code, lead_status`,
      [customer.id, project_id, plot_id ?? null, message ?? null],
    );
    if (assigned.rowCount) await client.query('UPDATE leads SET assigned_user_id = $2 WHERE id = $1', [lead.rows[0].id, assigned.rows[0].id]);
    await client.query('INSERT INTO audit_logs (action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4)', ['WEBSITE_ENQUIRY_CREATED', 'leads', 'lead', lead.rows[0].id]);
    return lead.rows[0];
  });
  res.status(201).json({ success: true, message: 'Enquiry submitted successfully', data: { enquiry_id: result.lead_code, status: result.lead_status } });
}));

api.post('/public/booking-requests', publicLimiter, asyncHandler(async (req, res) => {
  const { project_id, plot_id, customer, message } = parse(publicBookingSchema, req.body);
  if (req.body.website) throw new HttpError(400, 'VALIDATION_ERROR', 'The booking request could not be accepted.');
  const result = await pool.query(
    `SELECT pl.project_id FROM plots pl JOIN projects p ON p.id = pl.project_id
     WHERE pl.id = $1 AND pl.project_id = $2 AND p.status = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM layouts l WHERE l.project_id = p.id AND l.status = 'PUBLISHED')`,
    [plot_id, project_id],
  );
  if (!result.rowCount) throw new HttpError(404, 'PLOT_NOT_FOUND', 'Plot not found in this project.');
  const submitted = await submitBooking({
    plotId: plot_id,
    userId: null,
    customer: { full_name: customer.name.trim(), mobile: customer.mobile.trim(), email: customer.email },
    remarks: message ?? '',
    source: 'WEBSITE',
  });
  publishInventoryEvent(submitted.projectId, 'booking.submitted', { booking_id: submitted.booking.id, plot_id, plot_number: submitted.plotNumber });
  res.status(201).json({ success: true, message: 'Booking request received', data: { request_id: submitted.booking.booking_code, status: 'REQUESTED', requires_manager_approval: true } });
}));

api.get('/public/projects', asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.project_code, p.project_name, p.village, p.district, p.state, p.description
     FROM projects p WHERE p.status = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM layouts l WHERE l.project_id = p.id AND l.status = 'PUBLISHED')
     ORDER BY p.project_name`,
  );
  res.json({ success: true, data: result.rows });
}));

api.get('/public/projects/:projectId', asyncHandler(async (req, res) => {
  const projectId = parse(idSchema, req.params.projectId);
  const result = await pool.query(
    `SELECT p.id, p.project_code, p.project_name, p.project_type, p.total_land_area, p.area_unit,
      p.survey_number, p.village, p.taluka, p.district, p.state, p.pincode, p.description, p.highlights,
      COUNT(pl.id)::int AS total_plots,
      COUNT(pl.id) FILTER (WHERE pl.status = 'AVAILABLE')::int AS available_plots,
      COUNT(pl.id) FILTER (WHERE pl.status = 'HOLD')::int AS hold_plots,
      COUNT(pl.id) FILTER (WHERE pl.status = 'BOOKED')::int AS booked_plots
     FROM projects p LEFT JOIN plots pl ON pl.project_id = p.id
     WHERE p.id = $1 AND p.status = 'ACTIVE'
       AND EXISTS (SELECT 1 FROM layouts l WHERE l.project_id = p.id AND l.status = 'PUBLISHED')
     GROUP BY p.id`,
    [projectId],
  );
  if (!result.rowCount) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  res.json({ success: true, data: result.rows[0] });
}));

api.get('/public/projects/:projectId/layout', asyncHandler(async (req, res) => {
  const projectId = parse(idSchema, req.params.projectId);
  const result = await pool.query(
    `SELECT l.id, l.layout_name, l.version_number,
      COALESCE(json_agg(json_build_object(
        'plot_id', pl.plot_id, 'plot_number', p.plot_number, 'geometry', pl.geometry
      ) ORDER BY pl.display_order) FILTER (WHERE pl.id IS NOT NULL), '[]'::json) AS plots
     FROM layouts l
     LEFT JOIN plot_layouts pl ON pl.layout_id = l.id
     LEFT JOIN plots p ON p.id = pl.plot_id
     JOIN projects pr ON pr.id = l.project_id
     WHERE l.project_id = $1 AND l.status = 'PUBLISHED' AND pr.status = 'ACTIVE'
     GROUP BY l.id
     ORDER BY l.version_number DESC
     LIMIT 1`,
    [projectId],
  );
  if (!result.rowCount) throw new HttpError(404, 'LAYOUT_NOT_FOUND', 'No published layout is available for this project.');
  res.json({ success: true, data: result.rows[0] });
}));

api.get('/public/projects/:projectId/plots', asyncHandler(async (req, res) => {
  const projectId = parse(idSchema, req.params.projectId);
  const result = await pool.query(
    `SELECT pr.id AS project_id, pr.project_name,
      COUNT(pl.id)::int AS total_plots,
      COUNT(pl.id) FILTER (WHERE pl.status = 'AVAILABLE')::int AS available,
      COUNT(pl.id) FILTER (WHERE pl.status = 'HOLD')::int AS hold,
      COUNT(pl.id) FILTER (WHERE pl.status = 'PENDING_APPROVAL')::int AS pending_approval,
      COUNT(pl.id) FILTER (WHERE pl.status = 'BOOKED')::int AS booked,
      COUNT(pl.id) FILTER (WHERE pl.status = 'REGISTERED')::int AS registered,
      COUNT(pl.id) FILTER (WHERE pl.status = 'BLOCKED')::int AS blocked,
      COALESCE(json_agg(json_build_object(
        'id', pl.id, 'plot_number', pl.plot_number, 'area_sq_yard', pl.area_sq_yard,
        'area_sq_feet', pl.area_sq_feet, 'length', pl.length, 'width', pl.width, 'road_width', pl.road_width,
        'plot_type', pl.plot_type, 'direction', pl.direction,
        'price', pl.current_price, 'status', pl.status
      ) ORDER BY pl.plot_number) FILTER (WHERE pl.id IS NOT NULL), '[]'::json) AS plots
     FROM projects pr LEFT JOIN plots pl ON pl.project_id = pr.id
     WHERE pr.id = $1 AND pr.status = 'ACTIVE'
       AND EXISTS (SELECT 1 FROM layouts l WHERE l.project_id = pr.id AND l.status = 'PUBLISHED')
     GROUP BY pr.id`,
    [projectId],
  );
  if (!result.rowCount) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  res.json({ success: true, data: { ...result.rows[0], updated_at: new Date().toISOString() } });
}));

api.get('/public/projects/:projectId/inventory/stream', asyncHandler(async (req, res) => {
  const projectId = parse(idSchema, req.params.projectId);
  const result = await pool.query(
    `SELECT 1 FROM projects p WHERE p.id = $1 AND p.status = 'ACTIVE'
     AND EXISTS (SELECT 1 FROM layouts l WHERE l.project_id = p.id AND l.status = 'PUBLISHED')`,
    [projectId],
  );
  if (!result.rowCount) throw new HttpError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('event: connected\ndata: {"success":true}\n\n');
  const send = (event) => res.write(`id: ${event.event_id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`);
  const listener = (event) => send(event);
  inventoryEvents.on(`project:${projectId}`, listener);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    inventoryEvents.off(`project:${projectId}`, listener);
  });
}));

api.get('/leads', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'leads:read')) throw new HttpError(403, 'FORBIDDEN', 'You cannot view leads.');
  const result = await pool.query(
    `SELECT l.*, c.full_name AS customer_name, c.mobile, p.project_name
     FROM leads l JOIN customers c ON c.id = l.customer_id JOIN projects p ON p.id = l.project_id
     WHERE ($1::boolean OR p.id IN (SELECT project_id FROM user_projects WHERE user_id = $2))
       AND ($3::boolean OR l.assigned_user_id = $2 OR l.broker_id = $2)
     ORDER BY l.created_at DESC LIMIT 200`,
    [req.user.role === 'ADMIN', req.user.id, !['BROKER', 'SALES_EXECUTIVE'].includes(req.user.role)],
  );
  res.json({ success: true, data: result.rows });
}));

api.post('/leads', ...authRoute(async (req, res) => {
  if (!permissionsFor(req.user.role).some((permission) => permission === '*' || permission === 'leads:write')) throw new HttpError(403, 'FORBIDDEN', 'You cannot create leads.');
  const { full_name, mobile, email, project_id, interested_plot_id, source, remarks } = req.body;
  if (!full_name || !/^[+()\d\s-]{7,20}$/.test(mobile ?? '') || !project_id) throw new HttpError(400, 'VALIDATION_ERROR', 'Customer name, valid mobile number, and project are required.');
  parse(idSchema, project_id);
  if (interested_plot_id) parse(idSchema, interested_plot_id);
  await requireProjectAccess(req.user, project_id, pool);
  const result = await inTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM customers WHERE mobile = $1', [mobile.trim()]);
    const customer = existing.rowCount ? existing.rows[0] : (await client.query('INSERT INTO customers (full_name, mobile, email) VALUES ($1,$2,$3) RETURNING id', [full_name.trim(), mobile.trim(), email ?? null])).rows[0];
    return client.query(
      `INSERT INTO leads (customer_id, project_id, interested_plot_id, assigned_user_id, broker_id, source, lead_status, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,'NEW',$7) RETURNING *`,
      [customer.id, project_id, interested_plot_id ?? null, req.user.id, req.user.role === 'BROKER' ? req.user.id : null, source ?? 'CRM', remarks ?? null],
    );
  });
  await pool.query('INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'LEAD_CREATED', 'leads', 'lead', result.rows[0].id]);
  res.status(201).json({ success: true, data: result.rows[0] });
}));

api.get('/projects/:projectId/inventory-summary', ...authRoute(async (req, res) => {
  parse(idSchema, req.params.projectId);
  await requireProjectAccess(req.user, req.params.projectId, pool);
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='AVAILABLE')::int AS available,
      COUNT(*) FILTER (WHERE status='HOLD')::int AS hold,
      COUNT(*) FILTER (WHERE status='PENDING_APPROVAL')::int AS pending,
      COUNT(*) FILTER (WHERE status='BOOKED')::int AS booked,
      COUNT(*) FILTER (WHERE status='REGISTERED')::int AS registered,
      COUNT(*) FILTER (WHERE status='BLOCKED')::int AS blocked
     FROM plots WHERE project_id = $1`,
    [req.params.projectId],
  );
  res.json({ success: true, data: result.rows[0] });
}));

app.use('/api/v1', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'API endpoint not found.')));
app.use(respondError);

export async function expireHolds() {
  const expired = await inTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE plots SET status='AVAILABLE', held_by=NULL, hold_expires_at=NULL, updated_at=NOW()
       WHERE status='HOLD' AND hold_expires_at <= NOW()
       RETURNING id, project_id, plot_number`,
    );
    for (const plot of updated.rows) {
      await client.query(
        `INSERT INTO plot_status_history (plot_id, previous_status, new_status, reason)
         VALUES ($1,'HOLD','AVAILABLE','Temporary hold expired')`,
        [plot.id],
      );
    }
    return updated;
  });
  for (const plot of expired.rows) {
    publishInventoryEvent(plot.project_id, 'plot.hold.expired', { plot_id: plot.id, plot_number: plot.plot_number, status: 'AVAILABLE' });
  }
  return expired.rowCount;
}

export default app;
