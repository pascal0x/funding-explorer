import express from "express";
import { getRates, getLatestRate, getBulkAPR, getCoins } from "./db.js";
import { fetchVenue, fetchLive } from "./fetchers.js";
import { getCoinsForVenue } from "./discovery.js";
import { startScheduler, initialBackfill } from "./scheduler.js";
import { mountProxy } from "./proxy.js";

const app = express();
app.use(express.json());

// CORS for local dev (frontend on :5173)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── GET /api/funding/batch?venue=hl&coins=BTC,ETH,SOL&days=91 ────────────────
// Returns [{coin, apr7, apr30, apr90}] — one round-trip per venue
app.get("/api/funding/batch", async (req, res) => {
  const { venue, coins, days = "91" } = req.query;
  if (!venue || !coins) return res.status(400).json({ error: "venue and coins required" });

  const coinList = coins.split(",").map(c => c.trim()).filter(Boolean);
  const d = parseInt(days, 10);
  const now = Date.now();
  const D7  = 7  * 24 * 3600 * 1000;
  const D30 = 30 * 24 * 3600 * 1000;
  const freq = { hl: 24*365, bn: 3*365, by: 3*365, okx: 3*365, dy: 24*365, lt: 24*365, ad: 3*365 }[venue] ?? 24*365;

  try {
    const results = await Promise.all(coinList.map(async coin => {
      try {
        let data = await getRates(venue, coin, d);
        if (!data.length) {
          const live = await fetchVenue(venue, coin, d).catch(() => []);
          if (live.length) {
            const { insertRates } = await import("./db.js");
            await insertRates(live.map(r => ({ venue, coin, time: r.time, rate: r.fundingRate })));
            data = live;
          }
        }
        const d30 = data.filter(r => r.time >= now - D30);
        const d7  = data.filter(r => r.time >= now - D7);
        const avg = (arr) => arr.length ? arr.reduce((s, r) => s + Number(r.fundingRate), 0) / arr.length * 100 * freq : null;
        return { coin, apr7: avg(d7), apr30: avg(d30), apr90: avg(data) };
      } catch {
        return { coin, apr7: null, apr30: null, apr90: null };
      }
    }));
    res.json(results);
  } catch (e) {
    console.error("[api/funding/batch]", e.message);
    res.status(500).json({ error: e.message });
  }
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
// Proxies to the exchange's live endpoint for real-time data
app.get("/api/live", async (req, res) => {
  const { venue, coin } = req.query;
  if (!venue || !coin) return res.status(400).json({ error: "venue and coin required" });

  try {
    const data = await fetchLive(venue, coin);
    res.json(data);
  } catch (e) {
    console.error("[api/live]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/bulk-apr?venue=hl ───────────────────────────────────────────────
// Returns [{coin, avg7, avg30, avg90}] for all coins on a venue (single SQL query)
app.get("/api/bulk-apr", async (req, res) => {
  const { venue } = req.query;
  if (!venue) return res.status(400).json({ error: "venue required" });

  try {
    const data = await getBulkAPR(venue);
    res.json(data);
  } catch (e) {
    console.error("[api/bulk-apr]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/coins?venue=hl ──────────────────────────────────────────────────
// Returns list of coins available on a venue (from DB + dynamic discovery)
app.get("/api/coins", async (req, res) => {
  const { venue } = req.query;
  if (!venue) return res.status(400).json({ error: "venue required" });

  try {
    let coins = await getCoins(venue);
    if (!coins.length) {
      coins = await getCoinsForVenue(venue);
    }
    res.json(coins);
  } catch (e) {
    console.error("[api/coins]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/markets/:venue ───────────────────────────────────────────────────
// Returns all available markets for a venue (dynamic discovery)
app.get("/api/markets/:venue", async (req, res) => {
  const { venue } = req.params;
  try {
    if (venue === "ad") {
      const r = await fetch("https://fapi.asterdex.com/fapi/v1/exchangeInfo");
      if (!r.ok) return res.status(502).json({ error: "Asterdex unreachable" });
      const json = await r.json();
      const symbols = (json.symbols ?? [])
        .filter(s => s.status === "TRADING" && s.contractType === "PERPETUAL")
        .map(s => s.baseAsset ?? s.symbol?.replace(/USDT$/, ""))
        .filter(Boolean);
      return res.json([...new Set(symbols)]);
    }
    if (venue === "lt") {
      const r = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderbooks");
      if (!r.ok) return res.status(502).json({ error: "Lighter unreachable" });
      const json = await r.json();
      const symbols = (json.order_books ?? []).map(m => {
        const raw = m.base_token?.symbol ?? m.base_asset ?? "";
        return raw.toUpperCase().replace(/(-USDT?|-USD)$/, "");
      }).filter(Boolean);
      return res.json([...new Set(symbols)]);
    }
    res.status(400).json({ error: "unsupported venue for market discovery" });
  } catch (e) {
    console.error(`[api/markets/${venue}]`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/boros ────────────────────────────────────────────────────────────
const BOROS_BASE_SRV = "https://api.boros.finance/core";
let _borosCache = null;
let _borosCacheTime = 0;

// Rolling 7-day implied APR snapshots: { [marketKey]: [{ts, impliedApr}] }
const _borosImpliedHistory = {};
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const COLLATERALS_SRV = ["USDT", "USDC", "USD", "BTC", "ETH", "SOL", "USDE", "DAI"];
const extractCoinCollateral = (raw) => {
  for (const col of COLLATERALS_SRV) {
    if (raw.endsWith(col) && raw.length > col.length) {
      return { coin: raw.slice(0, -col.length), collateral: col };
    }
  }
  return { coin: raw, collateral: null };
};

app.get("/api/boros", async (req, res) => {
  try {
    // Cache 5 minutes
    if (_borosCache && Date.now() - _borosCacheTime < 5 * 60 * 1000) {
      return res.json(_borosCache);
    }
    const listRes = await fetch(`${BOROS_BASE_SRV}/v1/markets?limit=100&isWhitelisted=true`);
    if (!listRes.ok) return res.status(502).json({ error: `Boros API ${listRes.status}` });
    const listJson = await listRes.json();
    const list = listJson.results ?? (Array.isArray(listJson) ? listJson : []);

    const now = Date.now() / 1000;
    const active = list.filter(m => !m.imData?.maturity || m.imData.maturity > now);

    const details = await Promise.all(active.map(m =>
      fetch(`${BOROS_BASE_SRV}/v1/markets/${m.marketId}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    ));

    const nowMs = Date.now();
    const markets = details.filter(Boolean).map(m => {
      const raw = m.metadata?.name ?? "";
      const { coin, collateral } = extractCoinCollateral(raw);
      const marketKey = `${coin}-${collateral ?? "?"}-${m.imData?.maturity ?? 0}`;
      const impliedApr = m.data?.impliedApr ?? m.data?.markApr ?? null;

      // Accumulate snapshot for 7d avg
      if (impliedApr !== null) {
        if (!_borosImpliedHistory[marketKey]) _borosImpliedHistory[marketKey] = [];
        _borosImpliedHistory[marketKey].push({ ts: nowMs, impliedApr });
        const cutoff = nowMs - SEVEN_DAYS_MS;
        _borosImpliedHistory[marketKey] = _borosImpliedHistory[marketKey].filter(s => s.ts >= cutoff);
      }

      return {
        name:          m.imData?.name ?? raw,
        coin,
        collateral,
        marketKey,
        platform:      m.metadata?.platformName ?? "",
        maturity:      m.imData?.maturity ?? 0,
        impliedApr,
        underlyingApr: m.data?.underlyingApr ?? m.data?.floatingApr ?? null,
      };
    }).sort((a, b) => a.maturity - b.maturity);

    _borosCache = markets;
    _borosCacheTime = Date.now();
    res.json(markets);
  } catch (e) {
    console.error("[api/boros]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/boros/implied-avg ─────────────────────────────────────────────────
// Returns { [marketKey]: impliedApr7dAvg } from accumulated snapshots
app.get("/api/boros/implied-avg", (req, res) => {
  const result = {};
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  for (const [key, snaps] of Object.entries(_borosImpliedHistory)) {
    const recent = snaps.filter(s => s.ts >= cutoff);
    if (recent.length) {
      result[key] = recent.reduce((sum, s) => sum + s.impliedApr, 0) / recent.length;
    }
  }
  res.json(result);
});

// ── GET /api/status ───────────────────────────────────────────────────────────
app.get("/api/status", async (req, res) => {
  try {
    const { default: pool } = await import("./db.js");
    const r = await pool.query("SELECT COUNT(*) AS n, MAX(time) AS last FROM funding_rates");
    res.json({ rows: Number(r.rows[0].n), lastTime: Number(r.rows[0].last) });
  } catch (e) {
    console.error("[api/status]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CORS proxy for blocked venues (boros, lighter, asterdex) ─────────────────
mountProxy(app);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
  startScheduler();
  // Backfill in background — don't await so server is immediately available
  initialBackfill().catch(e => console.error("[backfill]", e.message));
});
