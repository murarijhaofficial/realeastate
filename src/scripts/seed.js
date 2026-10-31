import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

try {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || password === 'ChangeThisPassword123!') {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of 12 to 72 UTF-8 bytes in .env.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ($1,$2,$3,'ADMIN')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [name, email, passwordHash],
  );
  await pool.query(
    `INSERT INTO projects (project_code, project_name, survey_number, village, district, state)
     VALUES ('RATANPUR-01','Ratanpur Residential Project','254/1','Ratanpur','', '')
     ON CONFLICT (project_code) DO NOTHING`,
  );
  console.log('Administrator and starter project are ready. Sign-in details are available locally in .env.');
} catch (error) {
  console.error('Database seed failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
