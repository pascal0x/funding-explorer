import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  host:     "localhost",
  port:     5432,
  database: "funding_db",
  user:     "funding",
  password: "funding_pw_2026",
});

// Insert rows ignoring duplicates. rows = [{venue, coin, time, rate}]
export async function insertRates(rows) {
  if (!rows.length) return;
  const values = rows.map((r, i) =>
    `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
  ).join(",");
  const flat = rows.flatMap(r => [r.venue, r.coin, r.time, r.rate]);
  await pool.query(
    `INSERT INTO funding_rates (venue, coin, time, rate) VALUES ${values}
     ON CONFLICT (venue, coin, time) DO NOTHING`,
    flat
  );
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

export default pool;
