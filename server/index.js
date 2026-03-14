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
        const lastRate = data.length ? Number(data[data.length - 1].fundingRate) : null;
        return { coin, apr7: avg(d7), apr30: avg(d30), apr90: avg(data), lastRate };
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

// ── GET /api/coin-info?symbol=BTC ─────────────────────────────────────────────
// Proxies CoinGecko API — search by symbol, then fetch coin details + tickers
const _coinInfoCache = {};
const COIN_INFO_TTL = 30 * 60 * 1000; // 30 min cache

app.get("/api/coin-info", async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: "symbol required" });

  const sym = symbol.toUpperCase().replace(/^xyz:/, "");
  const cacheKey = sym;

  if (_coinInfoCache[cacheKey] && Date.now() - _coinInfoCache[cacheKey].ts < COIN_INFO_TTL) {
    return res.json(_coinInfoCache[cacheKey].data);
  }

  try {
    // Step 1: Search for the coin ID
    const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(sym)}`);
    if (!searchRes.ok) return res.status(502).json({ error: `CoinGecko search ${searchRes.status}` });
    const searchJson = await searchRes.json();
    const match = (searchJson.coins ?? []).find(c => c.symbol?.toUpperCase() === sym);
    if (!match) return res.json({ found: false, symbol: sym });

    // Step 2: Fetch coin details
    const coinRes = await fetch(`https://api.coingecko.com/api/v3/coins/${match.id}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false&sparkline=false`);
    if (!coinRes.ok) return res.status(502).json({ error: `CoinGecko coin ${coinRes.status}` });
    const coin = await coinRes.json();

    const md = coin.market_data ?? {};
    const result = {
      found: true,
      id: coin.id,
      symbol: coin.symbol?.toUpperCase(),
      name: coin.name,
      image: coin.image?.small ?? null,
      description: (coin.description?.en ?? "").slice(0, 300),
      marketCapRank: coin.market_cap_rank ?? null,
      marketCap: md.market_cap?.usd ?? null,
      totalVolume24h: md.total_volume?.usd ?? null,
      currentPrice: md.current_price?.usd ?? null,
      priceChange24h: md.price_change_percentage_24h ?? null,
      priceChange7d: md.price_change_percentage_7d ?? null,
      priceChange30d: md.price_change_percentage_30d ?? null,
      circulatingSupply: md.circulating_supply ?? null,
      maxSupply: md.max_supply ?? null,
      ath: md.ath?.usd ?? null,
      atl: md.atl?.usd ?? null,
      // Spot exchanges where you can buy
      spotExchanges: (coin.tickers ?? [])
        .filter(t => t.target === "USDT" || t.target === "USD" || t.target === "USDC")
        .reduce((acc, t) => {
          const name = t.market?.name;
          if (name && !acc.find(e => e.name === name)) {
            acc.push({ name, pair: `${t.base}/${t.target}`, tradeUrl: t.trade_url ?? null, volume24h: t.converted_volume?.usd ?? null });
          }
          return acc;
        }, [])
        .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
        .slice(0, 10),
      // Derivatives exchanges (perps)
      derivExchanges: (coin.tickers ?? [])
        .filter(t => t.market?.name && (t.target === "USD" || t.target === "USDT") && t.base?.includes("PERPETUAL"))
        .reduce((acc, t) => {
          const name = t.market?.name;
          if (name && !acc.find(e => e.name === name)) acc.push({ name, tradeUrl: t.trade_url ?? null });
          return acc;
        }, [])
        .slice(0, 10),
    };

    _coinInfoCache[cacheKey] = { ts: Date.now(), data: result };
    res.json(result);
  } catch (e) {
    console.error("[api/coin-info]", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/hl-market?coin=BTC ───────────────────────────────────────────────
// Returns Hyperliquid token info (OI, volume, funding, leverage) + orderbook liquidity analysis
let _hlMetaCache = null;
let _hlMetaCacheTime = 0;
const HL_META_TTL = 60 * 1000; // 1 min

async function getHlMeta() {
  if (_hlMetaCache && Date.now() - _hlMetaCacheTime < HL_META_TTL) return _hlMetaCache;
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!r.ok) throw new Error(`HL meta ${r.status}`);
  _hlMetaCache = await r.json();
  _hlMetaCacheTime = Date.now();
  return _hlMetaCache;
}

function analyzeOrderbook(levels, midPrice, sizes) {
  // levels = [[bids], [asks]], each entry = {px, sz, n}
  const [bids, asks] = levels;
  const bestBid = parseFloat(bids[0]?.px ?? 0);
  const bestAsk = parseFloat(asks[0]?.px ?? 0);
  const spread = bestAsk - bestBid;
  const spreadBps = midPrice > 0 ? (spread / midPrice) * 10000 : 0;

  // Calculate price impact for each size
  const impacts = sizes.map(targetUsd => {
    // Buy impact (walk up asks)
    let buyFilled = 0, buyCost = 0;
    for (const level of asks) {
      const px = parseFloat(level.px);
      const sz = parseFloat(level.sz);
      const levelUsd = sz * px;
      const remaining = targetUsd - buyCost;
      if (remaining <= 0) break;
      const fillUsd = Math.min(remaining, levelUsd);
      buyFilled += fillUsd / px;
      buyCost += fillUsd;
    }
    const avgBuyPx = buyFilled > 0 ? buyCost / buyFilled : bestAsk;
    const buySlipBps = midPrice > 0 ? ((avgBuyPx - midPrice) / midPrice) * 10000 : 0;

    // Sell impact (walk down bids)
    let sellFilled = 0, sellProceeds = 0;
    for (const level of bids) {
      const px = parseFloat(level.px);
      const sz = parseFloat(level.sz);
      const levelUsd = sz * px;
      const remaining = targetUsd - sellProceeds;
      if (remaining <= 0) break;
      const fillUsd = Math.min(remaining, levelUsd);
      sellFilled += fillUsd / px;
      sellProceeds += fillUsd;
    }
    const avgSellPx = sellFilled > 0 ? sellProceeds / sellFilled : bestBid;
    const sellSlipBps = midPrice > 0 ? ((midPrice - avgSellPx) / midPrice) * 10000 : 0;

    return {
      sizeUsd: targetUsd,
      buySlippageBps: Math.round(buySlipBps * 100) / 100,
      sellSlippageBps: Math.round(sellSlipBps * 100) / 100,
      avgSlippageBps: Math.round(((buySlipBps + sellSlipBps) / 2) * 100) / 100,
    };
  });

  // Depth: total USD within 0.5% / 1% / 2% of mid
  const depthBps = [50, 100, 200];
  const depth = depthBps.map(bps => {
    const range = midPrice * bps / 10000;
    const bidDepth = bids.reduce((sum, l) => {
      const px = parseFloat(l.px);
      return px >= midPrice - range ? sum + parseFloat(l.sz) * px : sum;
    }, 0);
    const askDepth = asks.reduce((sum, l) => {
      const px = parseFloat(l.px);
      return px <= midPrice + range ? sum + parseFloat(l.sz) * px : sum;
    }, 0);
    return { bps, bidUsd: Math.round(bidDepth), askUsd: Math.round(askDepth), totalUsd: Math.round(bidDepth + askDepth) };
  });

  return { bestBid, bestAsk, spread: Math.round(spread * 100) / 100, spreadBps: Math.round(spreadBps * 100) / 100, impacts, depth };
}

app.get("/api/hl-market", async (req, res) => {
  const { coin } = req.query;
  if (!coin) return res.status(400).json({ error: "coin required" });

  try {
    const [meta, bookRes] = await Promise.all([
      getHlMeta(),
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "l2Book", coin }),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);

    const universe = meta[0]?.universe ?? [];
    const ctxs = meta[1] ?? [];
    const idx = universe.findIndex(u => u.name === coin);
    if (idx < 0) return res.json({ found: false });

    const m = universe[idx];
    const ctx = ctxs[idx] ?? {};
    const midPrice = parseFloat(ctx.midPx ?? ctx.markPx ?? 0);

    const result = {
      found: true,
      coin: m.name,
      maxLeverage: m.maxLeverage,
      openInterest: parseFloat(ctx.openInterest ?? 0),
      openInterestUsd: parseFloat(ctx.openInterest ?? 0) * midPrice,
      dayNtlVlm: parseFloat(ctx.dayNtlVlm ?? 0),
      dayBaseVlm: parseFloat(ctx.dayBaseVlm ?? 0),
      markPx: parseFloat(ctx.markPx ?? 0),
      oraclePx: parseFloat(ctx.oraclePx ?? 0),
      midPx: midPrice,
      funding: parseFloat(ctx.funding ?? 0),
      premium: parseFloat(ctx.premium ?? 0),
      prevDayPx: parseFloat(ctx.prevDayPx ?? 0),
    };

    // Orderbook analysis
    if (bookRes?.levels) {
      result.orderbook = analyzeOrderbook(bookRes.levels, midPrice, [5000, 10000, 20000, 50000, 100000]);
    }

    res.json(result);
  } catch (e) {
    console.error("[api/hl-market]", e.message);
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
