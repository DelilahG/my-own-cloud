// Changes one user's storage quota.
// Usage: npm run user:quota -- <email> <megabytes>
import { pool } from './pool.js';

const [email, mbText] = process.argv.slice(2);
const mb = Number(mbText);

try {
  if (!email || !Number.isFinite(mb) || mb < 0) {
    console.error('Usage: npm run user:quota -- <email> <megabytes>');
    process.exitCode = 1;
  } else {
    const { rowCount } = await pool.query('UPDATE users SET quota_bytes = $1 WHERE lower(email) = lower($2)', [
      Math.floor(mb * 1024 * 1024),
      email,
    ]);
    if (rowCount) console.log(`[quota] ${email} now has a ${mb} MB quota.`);
    else {
      console.error(`[quota] No user with email ${email}.`);
      process.exitCode = 1;
    }
  }
} finally {
  await pool.end();
}
