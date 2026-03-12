import express from "express";
import { getRates, getLatestRate } from "./db.js";
import { fetchVenue } from "./fetchers.js";
import { startScheduler, initialBackfill } from "./scheduler.js";

const app = express();
app.use(express.json());

// CORS for local dev (frontend on :5173)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ── GET /api/funding?venue=hl&coin=BTC&days=90 ────────────────────────────────
// Returns [{time, fundingRate}] from DB, falls back to live fetch if DB empty
app.get("/api/funding", async (req, res) => {
  const { venue, coin, days = "90" } = req.query;
  if (!venue || !coin) return res.status(400).json({ error: "venue and coin required" });

  try {
    const d = parseInt(days, 10);
    let data = await getRates(venue, coin, d);

    // If DB has no data yet, fetch live and store
    if (!data.length) {
      console.log(`[api] DB miss ${venue}/${coin} — fetching live`);
      const live = await fetchVenue(venue, coin, d);
      if (live.length) {
        const { insertRates } = await import("./db.js");
        await insertRates(live.map(r => ({ venue, coin, time: r.time, rate: r.fundingRate })));
        data = live;
      }
    }

    res.json(data);
  } catch (e) {
    console.error("[api/funding]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/live?venue=hl&coin=BTC ──────────────────────────────────────────
// Returns the latest stored rate (for live ticker display)
app.get("/api/live", async (req, res) => {
  const { venue, coin } = req.query;
  if (!venue || !coin) return res.status(400).json({ error: "venue and coin required" });

  try {
    let row = await getLatestRate(venue, coin);

    if (!row) {
      const live = await fetchVenue(venue, coin, 1);
      if (live.length) {
        row = live[live.length - 1];
        const { insertRates } = await import("./db.js");
        await insertRates([{ venue, coin, time: row.time, rate: row.fundingRate }]);
      }
    }

    res.json(row ?? null);
  } catch (e) {
    console.error("[api/live]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/status ───────────────────────────────────────────────────────────
app.get("/api/status", async (req, res) => {
  const { default: pool } = await import("./db.js");
  const r = await pool.query("SELECT COUNT(*) AS n, MAX(time) AS last FROM funding_rates");
  res.json({ rows: Number(r.rows[0].n), lastTime: Number(r.rows[0].last) });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = 4000;
app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  startScheduler();
  // Backfill in background — don't await so server is immediately available
  initialBackfill().catch(e => console.error("[backfill]", e.message));
});
