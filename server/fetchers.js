// Server-side fetchers — no CORS constraints
// All functions return [{time (ms), fundingRate (string or number)}]

// ── Hyperliquid ───────────────────────────────────────────────────────────────
const HL_BASE = "https://api.hyperliquid.xyz/info";

export async function fetchHL(coin, days = 90) {
  const results = [];
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  let cursor = null;

  while (true) {
    const body = {
      type: "fundingHistory",
      coin,
      startTime: cursor ?? startTime,
      ...(cursor ? {} : {}),
    };
    const r = await fetch(HL_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) break;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) break;

    const mapped = data.map(d => ({ time: Number(d.time), fundingRate: d.fundingRate }));
    results.push(...mapped);

    if (data.length < 500) break;
    cursor = Number(data[data.length - 1].time) + 1;
    if (cursor > Date.now()) break;
  }
  return results;
}

// ── Binance ───────────────────────────────────────────────────────────────────
function bnSymbol(coin) {
  const MAP = { kPEPE: "1000PEPE", SPX: "1000SPX" };
  return (MAP[coin] ?? coin) + "USDT";
}

export async function fetchBinance(coin, days = 90) {
  const symbol = bnSymbol(coin);
  const results = [];
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  let start = startTime;

  while (true) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${start}&limit=1000`;
    const r = await fetch(url);
    if (!r.ok) break;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) break;

    results.push(...data.map(d => ({ time: Number(d.fundingTime), fundingRate: d.fundingRate })));
    if (data.length < 1000) break;
    start = Number(data[data.length - 1].fundingTime) + 1;
    if (start > Date.now()) break;
  }
  return results;
}

// ── Bybit ─────────────────────────────────────────────────────────────────────
function bySymbol(coin) {
  const MAP = { kPEPE: "1000PEPE", SPX: "1000SPX" };
  return (MAP[coin] ?? coin) + "USDT";
}

export async function fetchBybit(coin, days = 90) {
  const symbol = bySymbol(coin);
  const results = [];
  let cursor = "";

  while (true) {
    const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=200${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const json = await r.json();
    const list = json?.result?.list ?? [];
    if (!list.length) break;

    results.push(...list.map(d => ({ time: Number(d.fundingRateTimestamp), fundingRate: d.fundingRate })));

    const since = Date.now() - days * 24 * 3600 * 1000;
    if (Number(list[list.length - 1].fundingRateTimestamp) < since) break;

    const nextCursor = json?.result?.nextPageCursor;
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  const since = Date.now() - days * 24 * 3600 * 1000;
  return results.filter(d => d.time >= since);
}

// ── OKX ──────────────────────────────────────────────────────────────────────
function okxSymbol(coin) {
  const MAP = { kPEPE: "1000PEPE", SPX: "1000SPX", BNB: "BNB" };
  return (MAP[coin] ?? coin) + "-USDT-SWAP";
}

export async function fetchOKX(coin, days = 90) {
  const instId = okxSymbol(coin);
  const results = [];
  let after = "";
  const since = Date.now() - days * 24 * 3600 * 1000;

  while (true) {
    const url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=100${after ? "&after=" + after : ""}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const json = await r.json();
    const list = json?.data ?? [];
    if (!list.length) break;

    results.push(...list.map(d => ({ time: Number(d.fundingTime), fundingRate: d.fundingRate })));
    if (Number(list[list.length - 1].fundingTime) < since) break;

    after = list[list.length - 1].fundingTime;
    if (list.length < 100) break;
  }
  return results.filter(d => d.time >= since);
}

// ── dYdX ─────────────────────────────────────────────────────────────────────
const DYDX_COINS = ["BTC","ETH","SOL","AVAX","LINK","ARB","OP","DOGE","ADA",
  "XRP","LTC","MATIC","UNI","AAVE","CRV","JUP","WIF","PEPE","SUI","APT","BNB"];

export async function fetchDydx(coin, days = 90) {
  if (!DYDX_COINS.includes(coin)) return [];
  const ticker = `${coin}-USD`;
  const results = [];
  let cursor = null;
  const since = Date.now() - days * 24 * 3600 * 1000;

  while (true) {
    const url = `https://indexer.dydx.trade/v4/historicalFunding/${ticker}?limit=100${cursor ? "&effectiveBeforeOrAtHeight=" + cursor : ""}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const json = await r.json();
    const list = json?.historicalFunding ?? [];
    if (!list.length) break;

    const mapped = list.map(d => ({ time: new Date(d.effectiveAt).getTime(), fundingRate: d.rate }));
    results.push(...mapped);
    if (mapped[mapped.length - 1].time < since) break;

    cursor = list[list.length - 1].effectiveAtHeight;
    if (list.length < 100) break;
  }
  return results.filter(d => d.time >= since);
}

// ── Lighter ───────────────────────────────────────────────────────────────────
const LIGHTER_BASE = "https://mainnet.zklighter.elliot.ai/api/v1";
let _lighterMarkets = null;

async function getLighterMarkets() {
  if (_lighterMarkets) return _lighterMarkets;
  const r = await fetch(`${LIGHTER_BASE}/orderbooks`);
  if (!r.ok) throw new Error("Lighter markets fetch failed");
  const json = await r.json();
  const map = {};
  for (const m of json.orderbooks ?? []) {
    const sym = m.symbol?.replace(/_USDC$/, "").replace(/_USDT$/, "") ?? "";
    map[sym] = m.market_id ?? m.id;
  }
  _lighterMarkets = map;
  return map;
}

export async function fetchLighter(coin, days = 90) {
  const markets = await getLighterMarkets();
  const marketId = markets[coin];
  if (marketId === undefined) return [];

  const results = [];
  const since = Date.now() - days * 24 * 3600 * 1000;
  let start = Math.floor(since / 1000);

  while (true) {
    const url = `${LIGHTER_BASE}/funding_rate_history?market_id=${marketId}&start_time=${start}&count=500`;
    const r = await fetch(url);
    if (!r.ok) break;
    const json = await r.json();
    const list = json.funding_rates ?? json.results ?? json ?? [];
    if (!Array.isArray(list) || !list.length) break;

    results.push(...list.map(d => ({
      time: Number(d.created_at ?? d.timestamp ?? d.time) * (d.created_at < 1e12 ? 1000 : 1),
      fundingRate: d.funding_rate ?? d.rate,
    })));

    if (list.length < 500) break;
    const lastTs = results[results.length - 1].time / 1000;
    if (lastTs >= Date.now() / 1000) break;
    start = Math.floor(lastTs) + 1;
  }
  return results.filter(d => d.time >= since);
}

// ── Asterdex (Binance-compatible) ─────────────────────────────────────────────
function adSymbol(coin) {
  const MAP = { kPEPE: "1000PEPE" };
  return (MAP[coin] ?? coin) + "USDT";
}

export async function fetchAsterdex(coin, days = 90) {
  const symbol = adSymbol(coin);
  const results = [];
  const since = Date.now() - days * 24 * 3600 * 1000;
  let start = since;

  while (true) {
    const url = `https://fapi.asterdex.com/fapi/v1/fundingRate?symbol=${symbol}&startTime=${Math.floor(start)}&limit=1000`;
    const r = await fetch(url);
    if (!r.ok) break;
    const data = await r.json();
    if (!Array.isArray(data) || !data.length) break;

    results.push(...data.map(d => ({ time: Number(d.fundingTime), fundingRate: d.fundingRate })));
    if (data.length < 1000) break;
    start = Number(data[data.length - 1].fundingTime) + 1;
    if (start > Date.now()) break;
  }
  return results.filter(d => d.time >= since);
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
export async function fetchVenue(venue, coin, days) {
  switch (venue) {
    case "hl":  return fetchHL(coin, days);
    case "bn":  return fetchBinance(coin, days);
    case "by":  return fetchBybit(coin, days);
    case "okx": return fetchOKX(coin, days);
    case "dy":  return fetchDydx(coin, days);
    case "lt":  return fetchLighter(coin, days);
    case "ad":  return fetchAsterdex(coin, days);
    default:    return [];
  }
}
