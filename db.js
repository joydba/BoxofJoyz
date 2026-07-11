const { Pool } = require('pg');

// YugabyteDB Aeon requires SSL. Pull connection info from env vars so
// no secrets live in code (set these on Render/Vercel/Railway later).
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT || 5433,
  database: process.env.PGDATABASE || 'yugabyte',
  user: process.env.PGUSER || 'admin',
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false } // Aeon uses a CA cert; this keeps setup simple for an MVP
});

module.exports = pool;
