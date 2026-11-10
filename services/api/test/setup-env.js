// Never let Jest inherit the application's development/production database.
// Database-backed integration suites only run when TEST_DATABASE_URL is
// explicitly supplied; every other test receives an intentionally local URL.
process.env.NODE_ENV = 'test';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DIRECT_URL || process.env.TEST_DATABASE_URL;
}
