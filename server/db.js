import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  host:     process.env.PGHOST     || "localhost",
  port:     process.env.PGPORT     || 5432,
  database: process.env.PGDATABASE || "funding_db",
  user:     process.env.PGUSER     || "funding",
  password: process.env.PGPASSWORD || "funding_pw_2026",
});

// Insert rows ignoring duplicates. rows = [{venue, coin, time, rate}]
export async function insertRates(rows) {
  if (!rows.length) return;
  // Batch in chunks of 500 to stay within PG param limits
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk.map((r, j) =>
      `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`
    ).join(",");
    const flat = chunk.flatMap(r => [r.venue, r.coin, r.time, r.rate]);
    await pool.query(
      `INSERT INTO funding_rates (venue, coin, time, rate) VALUES ${values}
       ON CONFLICT (venue, coin, time) DO NOTHING`,
      flat
    );
  }
}

// Fetch stored history for a venue/coin over N days
export async function getRates(venue, coin, days) {
  const since = Date.now() - days * 24 * 3600 * 1000;
  const res = await pool.query(
    `SELECT time, rate AS "fundingRate"
       FROM funding_rates
      WHERE venue = $1 AND coin = $2 AND time >= $3
      ORDER BY time ASC`,
    [venue, coin, since]
  );
  return res.rows.map(r => ({ time: Number(r.time), fundingRate: Number(r.fundingRate) }));
}

// Latest stored rate for a venue/coin
export async function getLatestRate(venue, coin) {
  const res = await pool.query(
    `SELECT time, rate AS "fundingRate"
       FROM funding_rates
      WHERE venue = $1 AND coin = $2
      ORDER BY time DESC LIMIT 1`,
    [venue, coin]
  );
  return res.rows[0] ?? null;
}

// Timestamp of the most recent stored entry for venue/coin (to know from where to resume)
export async function getLastTime(venue, coin) {
  const res = await pool.query(
    `SELECT MAX(time) AS t FROM funding_rates WHERE venue = $1 AND coin = $2`,
    [venue, coin]
  );
  return res.rows[0]?.t ? Number(res.rows[0].t) : null;
}

// Bulk APR: average rates for all coins on a venue over 3d/7d/30d/90d
export async function getBulkAPR(venue) {
  const now = Date.now();
  const t3  = now - 3  * 24 * 3600 * 1000;
  const t7  = now - 7  * 24 * 3600 * 1000;
  const t30 = now - 30 * 24 * 3600 * 1000;
  const t90 = now - 90 * 24 * 3600 * 1000;
  const res = await pool.query(
    `SELECT coin,
       AVG(CASE WHEN time >= $2 THEN rate END) AS avg3,
       AVG(CASE WHEN time >= $3 THEN rate END) AS avg7,
       AVG(CASE WHEN time >= $4 THEN rate END) AS avg30,
       AVG(rate)                                AS avg90,
       (SELECT rate FROM funding_rates f2
        WHERE f2.venue = $1 AND f2.coin = funding_rates.coin
        ORDER BY f2.time DESC LIMIT 1) AS last_rate
     FROM funding_rates
     WHERE venue = $1 AND time >= $5
     GROUP BY coin`,
    [venue, t3, t7, t30, t90]
  );
  return res.rows.map(r => ({
    coin: r.coin,
    avg3:  r.avg3  !== null ? Number(r.avg3)  : null,
    avg7:  r.avg7  !== null ? Number(r.avg7)  : null,
    avg30: r.avg30 !== null ? Number(r.avg30) : null,
    avg90: r.avg90 !== null ? Number(r.avg90) : null,
    lastRate: r.last_rate !== null ? Number(r.last_rate) : null,
  }));
}

// List all distinct coins stored for a venue
export async function getCoins(venue) {
  const res = await pool.query(
    `SELECT DISTINCT coin FROM funding_rates WHERE venue = $1 ORDER BY coin`,
    [venue]
  );
  return res.rows.map(r => r.coin);
}

export default pool;
