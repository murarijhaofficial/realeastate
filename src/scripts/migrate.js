import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';

const migrationDirectory = path.resolve('src/migrations');
const client = await pool.connect();

try {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const files = (await fs.readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const existing = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (existing.rowCount) continue;
    await client.query('BEGIN');
    try {
      await client.query(await fs.readFile(path.join(migrationDirectory, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
