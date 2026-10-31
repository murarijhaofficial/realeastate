import jwt from 'jsonwebtoken';
import { HttpError, asyncHandler } from './errors.js';
import { pool } from './db.js';

const rolePermissions = {
  ADMIN: ['*'],
  PROJECT_MANAGER: ['projects:read', 'projects:write', 'inventory:read', 'inventory:write', 'bookings:read', 'bookings:approve', 'customers:read', 'customers:write', 'leads:read', 'leads:write'],
  SALES_MANAGER: ['projects:read', 'inventory:read', 'inventory:write', 'bookings:read', 'bookings:approve', 'customers:read', 'customers:write', 'leads:read', 'leads:write'],
  SALES_EXECUTIVE: ['projects:read', 'inventory:read', 'inventory:write', 'bookings:read', 'bookings:write', 'customers:read', 'customers:write', 'leads:read', 'leads:write'],
  BROKER: ['projects:read', 'inventory:read', 'inventory:write', 'bookings:read', 'bookings:write', 'customers:read', 'customers:write', 'leads:read', 'leads:write'],
  ACCOUNTS: ['projects:read', 'inventory:read', 'bookings:read', 'payments:read', 'payments:write'],
};

export function permissionsFor(role) {
  return rolePermissions[role] ?? [];
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    const permissions = permissionsFor(req.user?.role);
    if (!permissions.includes('*') && !permissions.includes(permission)) {
      return next(new HttpError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
    }
    next();
  };
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired.');
  }
  const account = await pool.query('SELECT role, is_active, token_version FROM users WHERE id = $1', [claims.id]);
  if (!account.rowCount || !account.rows[0].is_active) throw new HttpError(401, 'ACCOUNT_DISABLED', 'This account is unavailable.');
  if (claims.token_version !== account.rows[0].token_version) throw new HttpError(401, 'SESSION_REVOKED', 'Your session has been revoked. Sign in again.');
  req.user = { ...claims, role: account.rows[0].role };
  next();
});

export async function requireProjectAccess(user, projectId, client) {
  if (user.role === 'ADMIN') return;
  const result = await client.query(
    'SELECT 1 FROM user_projects WHERE user_id = $1 AND project_id = $2',
    [user.id, projectId],
  );
  if (!result.rowCount) throw new HttpError(403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this project.');
}
