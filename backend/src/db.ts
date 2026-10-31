import './env.ts';
import pg from 'pg';

const { Pool } = pg;
const sslRejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED ?? 'true';
if (!['true', 'false'].includes(sslRejectUnauthorized)) {
  throw new Error('DATABASE_SSL_REJECT_UNAUTHORIZED must be "true" or "false".');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: sslRejectUnauthorized === 'true' }
    : undefined,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export async function inTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
