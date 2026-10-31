import 'dotenv/config';
import app, { expireHolds } from './app.js';
import { pool } from './db.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');
if (process.env.JWT_SECRET === 'replace-with-a-long-random-secret-at-least-32-characters') {
  throw new Error('Replace the example JWT_SECRET with a private random secret.');
}

const port = Number(process.env.PORT ?? 3000);
const holdDuration = Number(process.env.HOLD_DURATION_MINUTES ?? 30);
if (!Number.isInteger(holdDuration) || holdDuration < 1 || holdDuration > 1440) {
  throw new Error('HOLD_DURATION_MINUTES must be an integer between 1 and 1440.');
}
const server = app.listen(port, () => {
  console.log(`Real Estate CRM listening on http://localhost:${port}`);
});

expireHolds().catch((error) => console.error('Failed to expire plot holds at startup:', error));
const holdExpiryTimer = setInterval(() => {
  expireHolds().catch((error) => console.error('Failed to expire plot holds:', error));
}, 15_000);
holdExpiryTimer.unref();

async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  clearInterval(holdExpiryTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
