// Runs once before the whole test run: verifies we are pointed at a
// disposable test database and brings its schema up to date.
export default async function globalSetup() {
  process.env.NODE_ENV = 'test';
  const { config } = await import('../src/config/env.js');

  const url = config.databaseUrl;
  if (!url) throw new Error('TEST_DATABASE_URL is not set — refusing to run tests.');
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    // Tests TRUNCATE every table. Never let that touch a real database.
    throw new Error(`Refusing to run tests against "${dbName}": the test database name must end with "_test".`);
  }

  const { pool } = await import('../src/db/pool.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
