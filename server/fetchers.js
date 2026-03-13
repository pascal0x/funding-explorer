// Server-side fetchers — no CORS constraints
// All history functions return [{time (ms), fundingRate (string or number)}]
// All live functions return {fundingRate, nextFundingTime?} or null

// XYZ set — stocks, commodities, FX that need special HL API path
const XYZ = new Set([
  "NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","COIN","AMD","PLTR","NFLX",
  "MSTR","GME","INTC","GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM",
  "PALLADIUM","URANIUM","ALUMINIUM","EUR","JPY","DXY","EWJ","EWY","TSM","HOOD",
  "LLY","ORCL","MU","CRCL","BABA","RIVN","COST","XYZ100","CRWV","SKHX","SMSN",
  "SNDK","SOFTBANK","KIOXIA","USAR","URNM",
]);

// ── Hyperliquid ───────────────────────────────────────────────────────────────
const HL_BASE = "https://api.hyperliquid.xyz/info";

function hlApiCoin(coin) {
  return XYZ.has(coin) ? `xyz:${coin}` : coin;
}

export async function fetchHL(coin, days = 90) {
  const results = [];
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  let cursor = null;
  const apiCoin = hlApiCoin(coin);

  while (true) {
    const body = {
      type: "fundingHistory",
      coin: apiCoin,
      startTime: cursor ?? startTime,
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

export async function fetchHLLive(coin) {
  const isXyz = XYZ.has(coin);
  const body = { type: "metaAndAssetCtxs" };
  if (isXyz) body.dex = "xyz";
  const r = await fetch(HL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const universe = data?.[0]?.universe ?? [];
  const ctxs = data?.[1] ?? [];
  const idx = universe.findIndex(u => u.name === coin);
  if (idx < 0 || !ctxs[idx]) return null;
  return {
    fundingRate: ctxs[idx].funding,
    premium: ctxs[idx].premium,
    nextFundingTime: null,
  };
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

export async function fetchBinanceLive(coin) {
  const symbol = bnSymbol(coin);
  const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
  if (!r.ok) return null;
  const d = await r.json();
  return {
    fundingRate: d.lastFundingRate,
    nextFundingTime: Number(d.nextFundingTime),
  };
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

export async function fetchBybitLive(coin) {
  const symbol = bySymbol(coin);
  const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
  if (!r.ok) return null;
  const json = await r.json();
  const item = json?.result?.list?.[0];
  if (!item) return null;
  return {
    fundingRate: item.fundingRate,
    nextFundingTime: Number(item.nextFundingTime),
  };
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

export async function fetchOKXLive(coin) {
  const instId = okxSymbol(coin);
  const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`);
  if (!r.ok) return null;
  const json = await r.json();
  const d = json?.data?.[0];
  if (!d) return null;
  return {
    fundingRate: d.fundingRate,
    nextFundingTime: Number(d.nextFundingTime),
  };
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

export async function fetchDydxLive(coin) {
  if (!DYDX_COINS.includes(coin)) return null;
  const ticker = `${coin}-USD`;
  const r = await fetch(`https://indexer.dydx.trade/v4/perpetualMarkets?ticker=${ticker}`);
  if (!r.ok) return null;
  const json = await r.json();
  const market = json?.markets?.[ticker];
  if (!market) return null;
  return {
    fundingRate: market.nextFundingRate,
    nextFundingTime: null,
  };
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

export async function fetchLighterLive(coin) {
  const markets = await getLighterMarkets();
  const marketId = markets[coin];
  if (marketId === undefined) return null;
  const r = await fetch(`${LIGHTER_BASE}/funding_rate_history?market_id=${marketId}&count=1`);
  if (!r.ok) return null;
  const json = await r.json();
  const list = json.funding_rates ?? json.results ?? json ?? [];
  if (!Array.isArray(list) || !list.length) return null;
  const d = list[0];
  return {
    fundingRate: d.funding_rate ?? d.rate,
    nextFundingTime: null,
  };
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

export async function fetchAsterdexLive(coin) {
  const symbol = adSymbol(coin);
  const r = await fetch(`https://fapi.asterdex.com/fapi/v1/premiumIndex?symbol=${symbol}`);
  if (!r.ok) return null;
  const d = await r.json();
  return {
    fundingRate: d.lastFundingRate,
    nextFundingTime: Number(d.nextFundingTime),
  };
}

// ── Dispatchers ──────────────────────────────────────────────────────────────
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

export async function fetchLive(venue, coin) {
  switch (venue) {
    case "hl":  return fetchHLLive(coin);
    case "bn":  return fetchBinanceLive(coin);
    case "by":  return fetchBybitLive(coin);
    case "okx": return fetchOKXLive(coin);
    case "dy":  return fetchDydxLive(coin);
    case "lt":  return fetchLighterLive(coin);
    case "ad":  return fetchAsterdexLive(coin);
    default:    return null;
  }
}
