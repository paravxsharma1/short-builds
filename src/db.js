const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/shortener',
});

// Links expire after this many days (project brief: 30 days)
const EXPIRY_DAYS = 30;

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS urls (
      id SERIAL PRIMARY KEY,
      code VARCHAR(10) UNIQUE NOT NULL,
      original_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_urls_expires_at ON urls (expires_at)');
}

async function saveUrl(code, originalUrl) {
  const result = await pool.query(
    `INSERT INTO urls (code, original_url, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${EXPIRY_DAYS} days')
     RETURNING code, original_url, created_at, expires_at`,
    [code, originalUrl]
  );
  return result.rows[0];
}

// Only returns links that haven't expired yet
async function findUrl(code) {
  const result = await pool.query(
    'SELECT original_url FROM urls WHERE code = $1 AND expires_at > NOW()',
    [code]
  );
  return result.rows[0] || null;
}

// Scheduled job: removes links older than 30 days
async function deleteExpired() {
  const result = await pool.query('DELETE FROM urls WHERE expires_at <= NOW()');
  return result.rowCount;
}

async function ping() {
  await pool.query('SELECT 1');
}

module.exports = { pool, init, saveUrl, findUrl, deleteExpired, ping, EXPIRY_DAYS };
