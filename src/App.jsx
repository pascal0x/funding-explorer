import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from "recharts";

function useIsMobile(bp = 640) {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", fn, { passive: true });
    return () => window.removeEventListener("resize", fn);
  }, [bp]);
  return m;
}

function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? JSON.parse(s) : defaultValue;
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

// ── Markets (no JP225/KR200 — no data; use EWJ/EWY instead) ─────────────────
const MARKETS = {
  "Crypto":      ["HYPE","BTC","ETH","SOL","AVAX","ARB","OP","MATIC","DYDX","BNB","WIF","LINK","SUI","APT","SPX","kPEPE"],
  "Stocks":      ["NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","COIN","AMD","PLTR","NFLX","MSTR","GME","INTC","TSM","HOOD","LLY","ORCL","MU"],
  "Commodities": ["GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM","PALLADIUM","URANIUM","ALUMINIUM"],
  "FX / ETF":    ["EUR","JPY","DXY","EWJ","EWY"],
};

// Asterdex non-crypto markets (different symbol names than HL)
const AD_STOCKS = ["AAPL","AMZN","GOOG","META","MSFT","NVDA","TSLA","INTC","HOOD","MU"];
const AD_COMMODITIES = ["XAU","XAG","XCU","XPD","XPT","NATGAS","CL"];
const AD_FX = ["SPX","QQQ","EWY","XNY"];
const AD_NON_CRYPTO = new Set([...AD_STOCKS, ...AD_COMMODITIES, ...AD_FX]);

const XYZ = new Set([
  "NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","COIN","AMD","PLTR","NFLX",
  "MSTR","GME","INTC","GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM",
  "PALLADIUM","URANIUM","ALUMINIUM","EUR","JPY","DXY","EWJ","EWY","TSM","HOOD",
  "LLY","ORCL","MU","CRCL","BABA","RIVN","COST","XYZ100","CRWV","SKHX","SMSN",
  "SNDK","SOFTBANK","KIOXIA","USAR","URNM",
]);

// ── Venues ────────────────────────────────────────────────────────────────────
const VENUES = [
  { id: "hl",  label: "Hyperliquid", color: "#4a9eff" },
  { id: "bn",  label: "Binance",     color: "#f0b90b" },
  { id: "by",  label: "Bybit",       color: "#e6a817" },
  { id: "okx", label: "OKX",         color: "#3d7fff" },
  { id: "dy",  label: "dYdX",        color: "#6966ff" },
  { id: "lt",  label: "Lighter",     color: "#00d4aa" },
  { id: "ad",  label: "Asterdex",    color: "#a855f7" },
];
// APR freq: HL/dYdX/Lighter 1h × 24 × 365, BN/BY/OKX/AD 8h × 3 × 365
const VENUE_FREQ = { hl: 24 * 365, bn: 3 * 365, by: 3 * 365, okx: 3 * 365, dy: 24 * 365, lt: 24 * 365, ad: 3 * 365 };
// Venues that only support crypto (not XYZ stocks/FX/commodities)
const CRYPTO_ONLY_VENUES = new Set(["bn", "by", "okx", "dy", "lt"]);

// Per-venue crypto asset lists (CEX / dYdX / Lighter have limited markets)
const VENUE_ASSETS = {
  hl:  MARKETS["Crypto"],
  bn:  ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF","HYPE","PEPE","TRUMP","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP"],
  by:  ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF","HYPE","PEPE","TRUMP","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP"],
  okx: ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF","HYPE","PEPE","TRUMP","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP"],
  dy:  ["BTC","ETH","SOL","AVAX","LINK","ARB","OP","DOGE","ADA","XRP","LTC","MATIC","UNI","AAVE","CRV","JUP","WIF","PEPE","SUI","APT","BNB"],
  lt:  ["BTC","ETH","SOL","AVAX","ARB","WIF","SUI","APT","LINK","BNB","HYPE"],
  ad:  ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","WIF","PEPE","TRUMP","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","JUP"],
};

// Show first N coins as buttons, rest in dropdown
const VISIBLE_COUNT = 10;

const TOP5_STATIC = ["BTC", "ETH", "SOL", "BNB", "LINK"];
const VENUE_POPULAR = {
  hl:  ["HYPE", "SUI", "AVAX", "WIF", "kPEPE"],
  bn:  ["kPEPE", "WIF", "SUI", "AVAX", "ARB"],
  by:  ["kPEPE", "WIF", "SUI", "AVAX", "ARB"],
  okx: ["SUI", "AVAX", "APT", "ARB", "WIF"],
  dy:  ["AVAX", "ARB", "OP", "DYDX", "SUI"],
  lt:  ["SUI", "AVAX", "ARB", "APT", "OP"],
  ad:  ["kPEPE", "WIF", "SUI", "AVAX", "ARB"],
};

function prioritizeCoins(venue, category, coins) {
  if (category !== "Crypto") return coins;
  const set = new Set(coins);
  const top5 = TOP5_STATIC.filter(c => set.has(c));
  const top5Set = new Set(top5);
  const next5 = (VENUE_POPULAR[venue] ?? []).filter(c => set.has(c) && !top5Set.has(c));
  const next5Set = new Set(next5);
  const rest = coins.filter(c => !top5Set.has(c) && !next5Set.has(c));
  return [...top5, ...next5, ...rest];
}
let ALL_ASSETS = [...new Set([
  ...MARKETS["Crypto"], ...MARKETS["Stocks"],
  ...MARKETS["Commodities"], ...MARKETS["FX / ETF"],
])];
let ARBI_ASSETS = VENUE_ASSETS.bn;

function apiCoin(c) { return XYZ.has(c) ? `xyz:${c}` : c; }
function isXyz(c) { return XYZ.has(c); }
function toAPR(r, freq = 24 * 365) { return parseFloat(r) * 100 * freq; }
function fmtRate(r) { return (parseFloat(r) * 100).toFixed(4) + "%"; }
function fmtAPR(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }
function fmtDateShort(ts) {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) + " " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function getCat(coin) {
  for (const [cat, list] of Object.entries(MARKETS)) if (list.includes(coin)) return cat;
  // Also check Asterdex-specific names
  if (AD_STOCKS.includes(coin)) return "Stocks";
  if (AD_COMMODITIES.includes(coin)) return "Commodities";
  if (AD_FX.includes(coin)) return "FX / ETF";
  return "Other";
}

// Symbol overrides / formatters
const BN_SYMBOL = { "PEPE": "1000PEPE", "kPEPE": "1000PEPE", "SHIB": "1000SHIB", "FLOKI": "1000FLOKI" };
function bnSym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
function bySym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
function adSym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
const OKX_SYMBOL = { "kPEPE": "1000PEPE", "PEPE": "1000PEPE", "SHIB": "1000SHIB" };
function okxSym(c) { return (OKX_SYMBOL[c] ?? c) + "-USDT-SWAP"; }
function dySym(c) { return c + "-USD"; }

// ── Per-venue asset availability ─────────────────────────────────────────────
// Static fallback sets (used before dynamic fetch completes)
const CEX_CRYPTO = new Set([
  "BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","DYDX","WIF","LINK","SUI","APT","kPEPE","HYPE",
]);
const DYDX_CRYPTO = new Set([
  "BTC","ETH","SOL","AVAX","ARB","OP","MATIC","BNB","WIF","LINK","SUI","APT","DYDX",
]);
const LIGHTER_CRYPTO = new Set(["BTC","ETH","SOL","ARB","OP","AVAX","BNB","LINK"]);

// Dynamic per-venue crypto asset lists (populated async on app load)
const _dynVenueAssets = {}; // { bn: [], by: [], okx: [], dy: [], lt: [], ad: [] }

function getVenueCoins(venue, category) {
  if (venue === "hl") return MARKETS[category] ?? [];
  // Asterdex supports non-crypto
  if (venue === "ad") {
    if (category === "Stocks") return AD_STOCKS;
    if (category === "Commodities") return AD_COMMODITIES;
    if (category === "FX / ETF") return AD_FX;
    // Crypto: use dynamic list minus non-crypto
    if (_dynVenueAssets.ad?.length) return _dynVenueAssets.ad.filter(c => !AD_NON_CRYPTO.has(c));
  }
  if (category !== "Crypto") return [];
  if (_dynVenueAssets[venue]?.length) {
    const cryptoSet = new Set(MARKETS["Crypto"]);
    return _dynVenueAssets[venue].filter(c => cryptoSet.has(c));
  }
  // Fallback to static
  const crypto = MARKETS["Crypto"];
  if (venue === "dy") return crypto.filter(c => DYDX_CRYPTO.has(c));
  if (venue === "lt") return crypto.filter(c => LIGHTER_CRYPTO.has(c));
  return crypto.filter(c => CEX_CRYPTO.has(c)); // bn, by, okx
}

// ── HL perp-dex discovery ─────────────────────────────────────────────────────
let _hlDexCache = null;
async function fetchHlDexes() {
  if (_hlDexCache) return _hlDexCache;
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "perpDexs" }),
    });
    const data = await res.json();
    // First element is null (main USDC dex), rest are named builder dexes
    const dexes = [{ id: "", label: "USDC" }];
    if (Array.isArray(data)) {
      for (const d of data) {
        if (!d?.name) continue;
        const label = d.fullName && d.fullName.length <= 16 ? d.fullName : d.name.toUpperCase();
        dexes.push({ id: d.name, label });
      }
    }
    _hlDexCache = dexes;
  } catch { _hlDexCache = [{ id: "", label: "USDC" }]; }
  return _hlDexCache;
}

// ── API — Hyperliquid ─────────────────────────────────────────────────────────
async function fetchAllFunding(coin, days, hlDexName = null) {
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  const allData = [];
  let cursor = startTime;
  // Named dex: prefix coin (e.g. "flx:ETH"); main dex: use apiCoin (handles xyz: for HIP-3)
  const coinParam = hlDexName ? `${hlDexName}:${coin}` : apiCoin(coin);
  for (let i = 0; i < 30; i++) {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fundingHistory", coin: coinParam, startTime: cursor }),
    });
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    allData.push(...batch);
    if (batch.length < 500) break;
    cursor = batch[batch.length - 1].time + 1;
  }
  const seen = new Set();
  return allData
    .filter(d => { if (seen.has(d.time)) return false; seen.add(d.time); return true; })
    .sort((a, b) => a.time - b.time);
}

async function fetchLiveFunding(coin, hlDexName = null) {
  const effectiveDex = hlDexName ?? (isXyz(coin) ? "xyz" : undefined);
  const body = effectiveDex ? { type: "metaAndAssetCtxs", dex: effectiveDex } : { type: "metaAndAssetCtxs" };
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const universe = data[0].universe;
  const ctxs = data[1];
  // Named dexes prefix coins in universe (e.g. "flx:ETH"); xyz dex also prefixes
  const target = hlDexName ? `${hlDexName}:${coin}` : (isXyz(coin) ? `xyz:${coin}` : coin);
  const idx = universe.findIndex(a => a.name === target);
  return idx !== -1 ? ctxs[idx] : null;
}

// ── API — HL perpDexs (HIP-3 DEXs) ───────────────────────────────────────────
async function fetchPerpDexs() {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "perpDexs" }),
    });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d) ? d.filter(x => x != null) : [];
  } catch { return []; }
}

async function fetchDexCoins(dexName) {
  try {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs", dex: dexName }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const universe = data[0]?.universe ?? [];
    return universe.map(a => {
      const idx = a.name.indexOf(":");
      return idx !== -1 ? a.name.slice(idx + 1) : a.name;
    }).filter(Boolean);
  } catch { return []; }
}

// ── API — Binance ─────────────────────────────────────────────────────────────
async function fetchBinanceFundingHistory(coin, days) {
  try {
    const startTime = Date.now() - days * 24 * 3600 * 1000;
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${bnSym(coin)}&startTime=${startTime}&limit=1000`
    );
    if (!res.ok) return [];
    const d = await res.json();
    if (!Array.isArray(d)) return [];
    return d.map(x => ({ time: x.fundingTime, fundingRate: x.fundingRate, premium: "0" }));
  } catch { return []; }
}

async function fetchBinanceLiveFunding(coin) {
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${bnSym(coin)}`);
    if (!res.ok) return null;
    const d = await res.json();
    return { funding: d.lastFundingRate, nextFundingTime: d.nextFundingTime };
  } catch { return null; }
}

// ── API — Asterdex (Binance-compatible) ───────────────────────────────────────
async function fetchAsterdexFundingHistory(coin, days) {
  try {
    const startTime = Date.now() - days * 24 * 3600 * 1000;
    // Try backend proxy first (Asterdex blocks browser CORS)
    try {
      const proxyRes = await fetch(`/api/proxy/asterdex/fapi/v1/fundingRate?symbol=${adSym(coin)}&startTime=${startTime}&limit=1000`);
      if (proxyRes.ok) {
        const d = await proxyRes.json();
        if (Array.isArray(d) && d.length) return d.map(x => ({ time: x.fundingTime, fundingRate: x.fundingRate, premium: "0" }));
      }
    } catch {}
    // Fallback: direct call (works in dev or if CORS is not blocked)
    const res = await fetch(
      `https://fapi.asterdex.com/fapi/v1/fundingRate?symbol=${adSym(coin)}&startTime=${startTime}&limit=1000`
    );
    if (!res.ok) return [];
    const d = await res.json();
    if (!Array.isArray(d)) return [];
    return d.map(x => ({ time: x.fundingTime, fundingRate: x.fundingRate, premium: "0" }));
  } catch { return []; }
}

async function fetchAsterdexLiveFunding(coin) {
  try {
    // Try backend proxy first
    try {
      const proxyRes = await fetch(`/api/proxy/asterdex/fapi/v1/premiumIndex?symbol=${adSym(coin)}`);
      if (proxyRes.ok) {
        const d = await proxyRes.json();
        if (d?.lastFundingRate != null) return { funding: d.lastFundingRate, nextFundingTime: d.nextFundingTime };
      }
    } catch {}
    // Fallback: direct call
    const res = await fetch(`https://fapi.asterdex.com/fapi/v1/premiumIndex?symbol=${adSym(coin)}`);
    if (!res.ok) return null;
    const d = await res.json();
    return d?.lastFundingRate != null
      ? { funding: d.lastFundingRate, nextFundingTime: d.nextFundingTime }
      : null;
  } catch { return null; }
}

// ── API — Bybit ───────────────────────────────────────────────────────────────
async function fetchBybitFundingHistory(coin, days) {
  try {
    const startTime = Date.now() - days * 24 * 3600 * 1000;
    const all = [];
    let cursor = "";
    for (let p = 0; p < 10; p++) {
      // Note: no startTime in URL — Bybit ignores it inconsistently; filter client-side instead
      const params = new URLSearchParams({ category: "linear", symbol: bySym(coin), limit: "200" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://api.bybit.com/v5/market/funding/history?${params}`);
      if (!res.ok) break;
      const d = await res.json();
      if (d.retCode !== 0) break;
      const list = d.result?.list ?? [];
      if (!list.length) break;
      let stop = false;
      for (const x of list) {
        const ts = +x.fundingRateTimestamp;
        if (ts < startTime) { stop = true; break; }
        all.push({ time: ts, fundingRate: x.fundingRate, premium: "0" });
      }
      cursor = d.result?.nextPageCursor ?? "";
      if (stop || !cursor) break;
    }
    return all.sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function fetchBybitLiveFunding(coin) {
  try {
    const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${bySym(coin)}`);
    if (!res.ok) return null;
    const d = await res.json();
    const item = d.result?.list?.[0];
    return item ? { funding: item.fundingRate, nextFundingTime: item.nextFundingTime } : null;
  } catch { return null; }
}

// ── API — OKX ─────────────────────────────────────────────────────────────────
async function fetchOkxFundingHistory(coin, days) {
  try {
    const startTime = Date.now() - days * 24 * 3600 * 1000;
    const all = [];
    let after = "";
    for (let p = 0; p < 10; p++) {
      const params = new URLSearchParams({ instId: okxSym(coin), limit: "100" });
      if (after) params.set("after", after);
      const res = await fetch(`https://www.okx.com/api/v5/public/funding-rate-history?${params}`);
      if (!res.ok) return [];
      const d = await res.json();
      if (d.code !== "0") return [];
      const list = d.data ?? [];
      if (!list.length) break;
      let stop = false;
      for (const x of list) {
        if (+x.fundingTime < startTime) { stop = true; break; }
        all.push({ time: +x.fundingTime, fundingRate: x.fundingRate, premium: "0" });
      }
      if (stop || list.length < 100) break;
      after = list[list.length - 1].fundingTime;
    }
    return all.sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function fetchOkxLiveFunding(coin) {
  try {
    const res = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${okxSym(coin)}`);
    if (!res.ok) return null;
    const d = await res.json();
    const item = d.data?.[0];
    return item ? { funding: item.fundingRate, nextFundingTime: +item.nextFundingTime } : null;
  } catch { return null; }
}

// ── API — dYdX ────────────────────────────────────────────────────────────────
async function fetchDydxFundingHistory(coin, days) {
  try {
    const startTime = Date.now() - days * 24 * 3600 * 1000;
    const all = [];
    let effectiveBeforeOrAt = new Date().toISOString();
    for (let p = 0; p < 30; p++) {
      const res = await fetch(
        `https://indexer.dydx.trade/v4/historicalFunding/${dySym(coin)}?limit=100&effectiveBeforeOrAt=${encodeURIComponent(effectiveBeforeOrAt)}`
      );
      if (!res.ok) break;
      const d = await res.json();
      const list = d.historicalFunding ?? [];
      if (!list.length) break;
      let stop = false;
      for (const x of list) {
        const ts = new Date(x.effectiveAt).getTime();
        if (ts < startTime) { stop = true; break; }
        all.push({ time: ts, fundingRate: x.rate, premium: "0" });
      }
      if (stop || list.length < 100) break;
      effectiveBeforeOrAt = list[list.length - 1].effectiveAt;
    }
    return all.sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function fetchDydxLiveFunding(coin) {
  try {
    const res = await fetch(`https://indexer.dydx.trade/v4/perpetualMarkets?ticker=${dySym(coin)}`);
    if (!res.ok) return null;
    const d = await res.json();
    const market = d.markets?.[dySym(coin)];
    return market ? { funding: market.nextFundingRate, nextFundingTime: null } : null;
  } catch { return null; }
}

// ── API — Lighter ─────────────────────────────────────────────────────────────
let _lighterMarkets = null;
async function getLighterMarketId(coin) {
  if (!_lighterMarkets) {
    _lighterMarkets = {};
    const parseLighterMarkets = (d) => {
      const list = d.order_books ?? d.orderBooks ?? d.markets ?? d ?? [];
      if (Array.isArray(list)) {
        list.forEach(m => {
          const raw = m.base_token?.symbol ?? m.base_asset ?? m.symbol ?? "";
          const sym = raw.toUpperCase().replace(/(-USDT?|-USD)$/, "");
          if (sym && m.market_id != null) _lighterMarkets[sym] = m.market_id;
        });
      } else if (typeof list === "object") {
        Object.entries(list).forEach(([k, v]) => {
          const sym = k.toUpperCase().replace(/(-USDT?|-USD)$/, "");
          if (sym) _lighterMarkets[sym] = v?.market_id ?? v;
        });
      }
    };
    // Try backend proxy first (Lighter blocks browser CORS)
    try {
      const proxyRes = await fetch("/api/proxy/lighter/orderbooks");
      if (proxyRes.ok) { parseLighterMarkets(await proxyRes.json()); return _lighterMarkets[coin] ?? null; }
    } catch {}
    // Fallback: direct call
    try {
      const res = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderbooks");
      if (res.ok) parseLighterMarkets(await res.json());
    } catch {}
  }
  return _lighterMarkets[coin] ?? null;
}

async function fetchLighterFundingHistory(coin, days) {
  try {
    const marketId = await getLighterMarketId(coin);
    if (marketId === null) return [];
    const startTime = Math.floor((Date.now() - days * 24 * 3600 * 1000) / 1000);
    const parseRates = (d) => {
      const list = d.funding_rates ?? d.fundingRates ?? (Array.isArray(d) ? d : []);
      return list.map(x => ({
        time: (x.timestamp ?? x.time) * 1000,
        fundingRate: String(x.rate ?? x.funding_rate ?? "0"),
        premium: "0",
      })).sort((a, b) => a.time - b.time);
    };
    // Try backend proxy first
    try {
      const proxyRes = await fetch(`/api/proxy/lighter/funding-rates?market_id=${marketId}&start_time=${startTime}&limit=500`);
      if (proxyRes.ok) { const d = await proxyRes.json(); const r = parseRates(d); if (r.length) return r; }
    } catch {}
    // Fallback: direct call
    const res = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/funding-rates?market_id=${marketId}&start_time=${startTime}&limit=500`
    );
    if (!res.ok) return [];
    return parseRates(await res.json());
  } catch { return []; }
}

async function fetchLighterLiveFunding(coin) {
  try {
    const marketId = await getLighterMarketId(coin);
    if (marketId === null) return null;
    const parseLive = (d) => {
      const list = d.funding_rates ?? d.fundingRates ?? (Array.isArray(d) ? d : []);
      const last = list[list.length - 1];
      return last ? { funding: String(last.rate ?? last.funding_rate ?? "0"), nextFundingTime: null } : null;
    };
    // Try backend proxy first
    try {
      const proxyRes = await fetch(`/api/proxy/lighter/funding-rates?market_id=${marketId}&limit=1`);
      if (proxyRes.ok) { const r = parseLive(await proxyRes.json()); if (r) return r; }
    } catch {}
    // Fallback: direct call
    const res = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/funding-rates?market_id=${marketId}&limit=1`
    );
    if (!res.ok) return null;
    return parseLive(await res.json());
  } catch { return null; }
}

// ── Module-level cache for Compare/Spread (survives navigation) ───────────────
// Key: "venue-days", value: [{coin, apr7, apr30, apr90}]
const _venueAprCache = {};

async function apiFetchVenueBatch(venue, coins, days) {
  const key = `${venue}-${days}-${coins.join(",")}`;
  if (_venueAprCache[key]) return _venueAprCache[key];
  try {
    const res = await fetch(`/api/funding/batch?venue=${venue}&coins=${encodeURIComponent(coins.join(","))}&days=${days}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      _venueAprCache[key] = data;
      return data;
    }
  } catch { /* fallback below */ }
  return null; // signals caller to use legacy path
}

// ── Backend API wrapper ───────────────────────────────────────────────────────
// In production, /api is proxied to the Node.js backend (nginx).
// In dev without backend, falls back to direct exchange calls.
async function apiFetchHistory(venue, coin, days, hlDexName = null) {
  // HIP-3 named dexes are HL-only and not stored in the backend DB
  if (venue === "hl" && hlDexName) {
    return fetchAllFunding(coin, days, hlDexName);
  }
  try {
    const res = await fetch(`/api/funding?venue=${venue}&coin=${encodeURIComponent(coin)}&days=${days}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data;
    // Empty response from backend — fall through to direct fetch
  } catch {
    // Backend unavailable (dev mode) — fall through to direct fetch
  }
  // Fallback: direct exchange call
  if      (venue === "hl")  return fetchAllFunding(coin, days);
  else if (venue === "bn")  return fetchBinanceFundingHistory(coin, days);
  else if (venue === "by")  return fetchBybitFundingHistory(coin, days);
  else if (venue === "okx") return fetchOkxFundingHistory(coin, days);
  else if (venue === "dy")  return fetchDydxFundingHistory(coin, days);
  else if (venue === "lt")  return fetchLighterFundingHistory(coin, days);
  else if (venue === "ad")  return fetchAsterdexFundingHistory(coin, days);
  return [];
}

// ── Dynamic asset discovery ───────────────────────────────────────────────────
let _assetsLoaded = false;

// Normalize exchange base asset names to internal convention ("1000PEPE" → "kPEPE")
function normalizeBase(base) {
  if (!base) return "";
  if (base.startsWith("1000")) return "k" + base.slice(4);
  return base;
}

async function _fetchHlMainAssets() {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta" }),
  });
  const data = await res.json();
  return (data.universe ?? []).map(u => u.name).filter(n => n && !n.includes(":"));
}

async function _fetchHlXyzAssets() {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs", dex: "xyz" }),
  });
  const data = await res.json();
  return (data[0]?.universe ?? []).map(u => {
    const n = u.name ?? "";
    return n.startsWith("xyz:") ? n.slice(4) : n;
  }).filter(Boolean);
}

async function _fetchBinancePerpAssets() {
  const res = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
  if (!res.ok) return [];
  const data = await res.json();
  return (data.symbols ?? [])
    .filter(s => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
    .map(s => normalizeBase(s.baseAsset)).filter(Boolean);
}

async function _fetchBybitPerpAssets() {
  const res = await fetch("https://api.bybit.com/v5/market/instruments-info?category=linear&settleCoin=USDT&limit=1000");
  if (!res.ok) return [];
  const data = await res.json();
  if (data.retCode !== 0) return [];
  return (data.result?.list ?? [])
    .filter(s => s.status === "Trading")
    .map(s => normalizeBase(s.baseCoin || s.symbol.replace(/USDT$/, ""))).filter(Boolean);
}

async function _fetchOkxPerpAssets() {
  const res = await fetch("https://www.okx.com/api/v5/public/instruments?instType=SWAP");
  if (!res.ok) return [];
  const data = await res.json();
  if (data.code !== "0") return [];
  return (data.data ?? [])
    .filter(s => s.settleCcy === "USDT" && s.state === "live")
    .map(s => normalizeBase(s.baseCcy)).filter(Boolean);
}

async function _fetchDydxPerpAssets() {
  const res = await fetch("https://indexer.dydx.trade/v4/perpetualMarkets");
  if (!res.ok) return [];
  const data = await res.json();
  return Object.keys(data.markets ?? {}).map(sym => sym.replace(/-USD$/, "")).filter(Boolean);
}

async function _fetchLighterPerpAssets() {
  await getLighterMarketId("BTC"); // fills _lighterMarkets cache
  return Object.keys(_lighterMarkets ?? {});
}

async function _fetchAsterdexPerpAssets() {
  try {
    const res = await fetch("/api/markets/ad");
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map(normalizeBase).filter(Boolean) : [];
  } catch { return []; }
}

// Static sets for HL xyz categorization (used to sort dynamically discovered assets)
const _XYZ_COMMODITY_SET = new Set(["GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM","PALLADIUM","URANIUM","ALUMINIUM","URNM"]);
const _XYZ_FX_SET = new Set(["EUR","JPY","DXY","EWJ","EWY","USAR"]);

async function fetchDynamicAssets() {
  if (_assetsLoaded) return;
  _assetsLoaded = true;

  const results = await Promise.allSettled([
    _fetchHlMainAssets(),
    _fetchHlXyzAssets(),
    _fetchBinancePerpAssets(),
    _fetchBybitPerpAssets(),
    _fetchOkxPerpAssets(),
    _fetchDydxPerpAssets(),
    _fetchLighterPerpAssets(),
    _fetchAsterdexPerpAssets(),
  ]);

  const val = (r) => (r.status === "fulfilled" && r.value?.length ? r.value : null);
  const [hlMain, hlXyz, bnCoins, byCoins, okxCoins, dyCoins, ltCoins, adCoins] = results.map(val);

  // Update HL Crypto (main dex universe)
  if (hlMain?.length) {
    MARKETS["Crypto"] = hlMain;
  }

  // Update HL xyz: classify into Stocks / Commodities / FX+ETF
  if (hlXyz?.length) {
    const stocks = [], commodities = [], fx = [];
    for (const name of hlXyz) {
      XYZ.add(name); // ensure isXyz() returns true for new assets
      if (_XYZ_COMMODITY_SET.has(name)) commodities.push(name);
      else if (_XYZ_FX_SET.has(name)) fx.push(name);
      else stocks.push(name); // unknown xyz → stocks by default
    }
    if (stocks.length)      MARKETS["Stocks"]      = stocks;
    if (commodities.length) MARKETS["Commodities"] = commodities;
    if (fx.length)          MARKETS["FX / ETF"]    = fx;
  }

  // Update per-venue dynamic lists
  if (bnCoins)  _dynVenueAssets.bn  = bnCoins;
  if (byCoins)  _dynVenueAssets.by  = byCoins;
  if (okxCoins) _dynVenueAssets.okx = okxCoins;
  if (dyCoins)  _dynVenueAssets.dy  = dyCoins;
  if (ltCoins)  _dynVenueAssets.lt  = ltCoins;
  if (adCoins)  _dynVenueAssets.ad  = adCoins;

  // Recompute ALL_ASSETS
  ALL_ASSETS = [...new Set([
    ...MARKETS["Crypto"], ...MARKETS["Stocks"],
    ...MARKETS["Commodities"], ...MARKETS["FX / ETF"],
  ])];

  // Recompute ARBI_ASSETS: HL crypto ∩ BN ∩ BY
  if (_dynVenueAssets.bn?.length && _dynVenueAssets.by?.length) {
    const bnSet = new Set(_dynVenueAssets.bn);
    const bySet = new Set(_dynVenueAssets.by);
    const arbi = MARKETS["Crypto"].filter(c => bnSet.has(c) && bySet.has(c));
    if (arbi.length) ARBI_ASSETS = arbi;
  }
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color, live }) => (
  <div style={{ background: "var(--bg-card)", border: `1px solid ${live ? "#4a9eff55" : "var(--border)"}`, borderRadius: 10, padding: "11px 13px" }}>
    <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
      {label}
      {live !== undefined && <span style={{ width: 5, height: 5, borderRadius: "50%", background: live ? "#00d4aa" : "var(--ghost)", display: "inline-block" }} />}
    </div>
    <div style={{ fontSize: 14, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
  </div>
);

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const p = d.rate >= 0;
  return (
    <div style={{ background: "#111827", border: `1px solid ${p ? "#16c78444" : "#ea394344"}`, borderRadius: 8, padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
      <div style={{ color: "#4a9eff", marginBottom: 5, fontSize: 10 }}>{fmtDateTime(d.time)}</div>
      <div style={{ marginBottom: 2 }}>Rate <span style={{ color: p ? "#16c784" : "#ea3943", fontWeight: 600 }}>{fmtRate(d.rawRate)}</span></div>
      <div style={{ color: "#64748b", marginBottom: 2 }}>Premium <span style={{ color: "#94a3b8" }}>{(parseFloat(d.rawPremium) * 100).toFixed(4)}%</span></div>
      <div style={{ color: "#64748b" }}>APR <span style={{ color: p ? "#16c784" : "#ea3943", fontWeight: 600 }}>{fmtAPR(d.apr)}</span></div>
    </div>
  );
};

// Coin selector: first N as buttons, rest as styled dropdown
function CoinSelector({ coins, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visible = coins.slice(0, VISIBLE_COUNT);
  const rest = coins.slice(VISIBLE_COUNT);
  const restSelected = rest.includes(selected);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {visible.map(c => (
        <button key={c} onClick={() => onSelect(c)} style={{
          boxSizing: "border-box",
          background: selected === c ? "#4a9eff22" : "transparent",
          border: `1px solid ${selected === c ? "#4a9eff" : "var(--border)"}`,
          borderRadius: 4,
          color: selected === c ? "#4a9eff" : "var(--text-dim)",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          padding: "5px 10px",
          cursor: "pointer",
          lineHeight: 1,
        }}>{c}</button>
      ))}

      {rest.length > 0 && (
        <div ref={ref} style={{ position: "relative" }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              boxSizing: "border-box",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: restSelected ? "#4a9eff22" : "transparent",
              border: `1px solid ${restSelected ? "#4a9eff" : open ? "#4a9eff55" : "var(--border)"}`,
              borderRadius: 4,
              color: restSelected ? "#4a9eff" : "var(--text-dim)",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10,
              padding: "5px 7px 5px 9px",
              cursor: "pointer",
              lineHeight: 1,
              minWidth: 70,
            }}
          >
            <span style={{ flex: 1 }}>{restSelected ? selected : `+${rest.length}`}</span>
            {restSelected && <span style={{ fontSize: 9, opacity: 0.6, marginRight: 2 }}>+{rest.length}</span>}
            <span style={{
              display: "inline-block",
              width: 0, height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: `5px solid ${restSelected ? "#4a9eff" : "var(--text-dim)"}`,
              transition: "transform 0.15s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0,
              marginTop: open ? -2 : 2,
            }} />
          </button>

          {open && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 5px)",
              left: 0,
              zIndex: 500,
              background: "var(--bg-dropdown)",
              border: "1px solid #253a5f",
              borderRadius: 6,
              overflow: "hidden",
              minWidth: 120,
              boxShadow: "0 16px 40px rgba(0,0,0,0.9)",
            }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: rest.length > 8 ? "1fr 1fr" : "1fr",
                maxHeight: 260,
                overflowY: "auto",
              }}>
                {rest.map(c => (
                  <button
                    key={c}
                    onClick={() => { onSelect(c); setOpen(false); }}
                    style={{
                      boxSizing: "border-box",
                      display: "block",
                      width: "100%",
                      background: selected === c ? "#4a9eff18" : "transparent",
                      border: "none",
                      borderBottom: "1px solid var(--border)",
                      color: selected === c ? "#4a9eff" : "var(--text-dim)",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      padding: "8px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#1e1e35"; e.currentTarget.style.color = "#ddd"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = selected === c ? "#4a9eff18" : "transparent"; e.currentTarget.style.color = selected === c ? "#4a9eff" : "var(--text-dim)"; }}
                  >{c}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FAVORITES (localStorage) ─────────────────────────────────────────────────
function useFavorites() {
  const [favorites, setFavorites] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("funding-favorites") || "[]")); }
    catch { return new Set(); }
  });
  const toggle = useCallback((coin) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(coin)) next.delete(coin); else next.add(coin);
      localStorage.setItem("funding-favorites", JSON.stringify([...next]));
      return next;
    });
  }, []);
  return { favorites, toggle };
}

// ── OI CAP (Hyperliquid only) ────────────────────────────────────────────────
function useOiCapSet(venue) {
  const [capSet, setCapSet] = useState(new Set());
  useEffect(() => {
    if (venue !== "hl") { setCapSet(new Set()); return; }
    let cancelled = false;
    fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "perpsAtOpenInterestCap" }),
    })
      .then(r => r.ok ? r.json() : [])
      .then(list => { if (!cancelled && Array.isArray(list)) setCapSet(new Set(list)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [venue]);
  return capSet;
}

// ── TOP ASSETS BAR ───────────────────────────────────────────────────────────
// Fetches bulk APR data from the backend for a given venue
function useTopAssets(venue) {
  const [data, setData] = useState({ top: [], bottom: [] });
  useEffect(() => {
    let cancelled = false;
    const freq = VENUE_FREQ[venue] ?? 24 * 365;
    fetch(`/api/bulk-apr?venue=${encodeURIComponent(venue)}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        if (cancelled) return;
        const all = rows
          .filter(r => r.avg7 != null)
          .map(r => ({ coin: r.coin, avg7: r.avg7 * 100 * freq, avg30: r.avg30 != null ? r.avg30 * 100 * freq : null }));
        const byApr = [...all].sort((a, b) => b.avg7 - a.avg7);
        const top = byApr.slice(0, 3);
        const bottom = byApr.slice(-3).reverse(); // lowest first
        setData({ top, bottom });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [venue]);
  return data;
}

// Renders a horizontal row of top asset cards
// items: [{label, value (number, APR %), onClick?}]
function TopAssetsBar({ items, activeLabel, onSelect, splitAt, oiCapSet }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
      {items.map((item, i) => {
        const isActive = activeLabel && item.label === activeLabel;
        const color = item.value >= 0 ? "#16c784" : "#ea3943";
        const hasSparkline = item.sparkline && item.sparkline.length > 1;
        let sparkPoints = "";
        if (hasSparkline) {
          const pts = item.sparkline;
          const mn = Math.min(...pts), mx = Math.max(...pts);
          const range = mx - mn || 1;
          sparkPoints = pts.map((v, j) => `${(j / (pts.length - 1)) * 50},${24 - ((v - mn) / range) * 20}`).join(" ");
        }
        return (
          <Fragment key={item.label + i}>
            {splitAt && i === splitAt && (
              <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", flexShrink: 0, margin: "0 2px" }} />
            )}
            <div
              onClick={() => onSelect?.(item.label)}
              style={{
                position: "relative",
                flex: "1 1 0",
                minWidth: hasSparkline ? 140 : 100,
                background: isActive ? "#4a9eff12" : "var(--bg-card)",
                border: `1px solid ${isActive ? "#4a9eff55" : "var(--border)"}`,
                borderRadius: 8,
                padding: "10px 12px",
                cursor: onSelect ? "pointer" : "default",
                transition: "border-color 0.15s, background 0.15s",
                overflow: "hidden",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? "#4a9eff" : "var(--text)", letterSpacing: "0.02em" }}>
                {item.label}
                {oiCapSet?.has(item.label) && <span title="Open Interest cap reached — no new positions can be opened on this asset" style={{ marginLeft: 3, fontSize: 7, opacity: 0.7 }}>🔒</span>}
              </span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
                {item.value >= 0 ? "+" : ""}{item.value.toFixed(1)}%
              </div>
              {item.sub && <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 3, letterSpacing: "0.04em" }}>{item.sub}</div>}
              {hasSparkline && (
                <svg width={50} height={24} viewBox="0 0 50 24" style={{ position: "absolute", right: 8, bottom: 8 }}>
                  <polyline points={sparkPoints} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4} />
                </svg>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// ── STRUCTURAL FUNDING ANALYSIS ──────────────────────────────────────────────

const SF_HORIZONS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,21,30,45,60,90];

/** Compute MA for each horizon from raw rates. ppd = periods per day (24 for 1h, 3 for 8h) */
function computeStructuralMAs(rates, ppd) {
  if (!rates || rates.length === 0) return [];
  return SF_HORIZONS
    .map(d => {
      const n = d * ppd;               // number of observations for this horizon
      if (rates.length < n) return null; // not enough data
      const slice = rates.slice(-n);    // take the last n observations
      const avg = slice.reduce((s, r) => s + r.rate, 0) / n;
      return { days: d, ma: avg };      // rate is already in % (fundingRate*100)
    })
    .filter(Boolean);
}

// ── EXPLORER ──────────────────────────────────────────────────────────────────
function ExplorerPage({ venue, category, coin, setCoin, hlDex, setHlDex }) {
  const isMobile = useIsMobile();
  const { favorites, toggle: toggleFavorite } = useFavorites();
  const [inputCoin, setInputCoin] = useState(coin);
  useEffect(() => { setInputCoin(coin); }, [coin]);
  const [dexCoins, setDexCoins] = useState([]);   // coins available on current hlDex
  const [period, setPeriod] = useState(7);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [live, setLive] = useState(null);
  const liveRef = useRef(null);
  const { top: topAssets, bottom: bottomAssets } = useTopAssets(venue);
  const oiCapSet = useOiCapSet(venue);

  // Market table states (side-by-side layout)
  const [marketData, setMarketData] = useState([]);   // [{coin, apr7, apr30, apr90}]
  const [marketLoading, setMarketLoading] = useState(false);
  const [mktPage, setMktPage] = useState(0);
  const [mktSort, setMktSort] = useState({ col: "apr7", dir: -1 });
  const [searchFilter, setSearchFilter] = useState("");
  const [coinInfo, setCoinInfo] = useState(null);
  const [coinInfoLoading, setCoinInfoLoading] = useState(false);
  const [hlMarket, setHlMarket] = useState(null);
  const MKT_PAGE_SIZE = 20;

  // MA overlay states (merged from TrendPage)
  const [showMA, setShowMA] = useState(false);
  const [maMode, setMaMode] = useState("daily");
  const [activeWins, setActiveWins] = useState(new Set(["ma7", "ma30", "ma90"]));

  const wins = maMode === "daily" ? DAILY_WINS : (INTRADAY_WINS[venue] || DAILY_WINS);
  const toggleWin = useCallback((key) => {
    setActiveWins(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }, []);

  // Reset active windows when mode changes
  useEffect(() => {
    if (maMode === "daily") setActiveWins(new Set(["ma7", "ma30", "ma90"]));
    else { const w = INTRADAY_WINS[venue] || DAILY_WINS; setActiveWins(new Set(w.slice(0, 2).map(x => x.key))); }
  }, [maMode, venue]);

  // Compute MA overlay data from existing data
  const freq = VENUE_FREQ[venue] || 8760;
  const ppd = venue === "hl" || venue === "dy" || venue === "lt" ? 24 : 3;
  const activeWinList = wins.filter(w => activeWins.has(w.key));
  const maData = useMemo(() => {
    if (!showMA || data.length === 0 || activeWinList.length === 0) return null;
    const base = data.map(d => ({ time: d.time, rate: d.rate }));
    const windows = activeWinList.map(w => ({ key: w.key, n: maMode === "daily" ? w.n * ppd : w.n }));
    return applyRollingMA(base, windows);
  }, [showMA, data, activeWinList, maMode, ppd]);

  // Structural funding MAs (for basis trade analysis)
  const structuralMAs = useMemo(() => computeStructuralMAs(data, ppd), [data, ppd]);

  // Fetch ALL market data from bulk-apr endpoint
  useEffect(() => {
    if (hlDex) return; // skip bulk fetch for named dexes
    setMarketLoading(true);
    const freq = VENUE_FREQ[venue] ?? 24 * 365;
    fetch(`/api/bulk-apr?venue=${encodeURIComponent(venue)}`)
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const parsed = rows.map(r => ({
          coin: r.coin,
          lastRate: r.lastRate,
          apr3:  r.avg3  != null ? r.avg3  * 100 * freq : null,
          apr7:  r.avg7  != null ? r.avg7  * 100 * freq : null,
          apr30: r.avg30 != null ? r.avg30 * 100 * freq : null,
          apr90: r.avg90 != null ? r.avg90 * 100 * freq : null,
        }));
        setMarketData(parsed);
        setMarketLoading(false);
      })
      .catch(() => { setMarketData([]); setMarketLoading(false); });
  }, [venue, hlDex]);

  // Fetch coin info from CoinGecko (via backend proxy)
  useEffect(() => {
    const sym = coin.replace(/^xyz:/, "");
    if (!sym) { setCoinInfo(null); return; }
    setCoinInfoLoading(true);
    fetch(`/api/coin-info?symbol=${encodeURIComponent(sym)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setCoinInfo(d); setCoinInfoLoading(false); })
      .catch(() => { setCoinInfo(null); setCoinInfoLoading(false); });
  }, [coin]);

  // Fetch Hyperliquid market data (OI, volume, orderbook) when venue is HL
  useEffect(() => {
    if (venue !== "hl") { setHlMarket(null); return; }
    const c = coin.replace(/^xyz:/, "");
    fetch(`/api/hl-market?coin=${encodeURIComponent(c)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setHlMarket(d?.found ? d : null))
      .catch(() => setHlMarket(null));
  }, [venue, coin]);

  // When hlDex changes, load its coins and auto-select first one
  useEffect(() => {
    if (hlDex) {
      fetchDexCoins(hlDex).then(coins => {
        setDexCoins(coins);
        if (coins.length > 0) { setCoin(coins[0]); setInputCoin(coins[0]); }
      });
    } else {
      setDexCoins([]);
    }
  }, [hlDex]);

  const loadLive = useCallback(async (c, v, d) => {
    try {
      // For HL with named dex, go direct (not stored in backend)
      if (v === "hl" && d) { setLive(await fetchLiveFunding(c, d)); return; }
      // Try backend /api/live first
      try {
        const res = await fetch(`/api/live?venue=${v}&coin=${encodeURIComponent(c)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.fundingRate != null) { setLive({ funding: data.fundingRate, nextFundingTime: data.nextFundingTime }); return; }
        }
      } catch {}
      // Fallback: direct exchange calls
      if      (v === "hl")  setLive(await fetchLiveFunding(c, d));
      else if (v === "bn")  setLive(await fetchBinanceLiveFunding(c));
      else if (v === "by")  setLive(await fetchBybitLiveFunding(c));
      else if (v === "okx") setLive(await fetchOkxLiveFunding(c));
      else if (v === "dy")  setLive(await fetchDydxLiveFunding(c));
      else if (v === "lt")  setLive(await fetchLighterLiveFunding(c));
      else if (v === "ad")  setLive(await fetchAsterdexLiveFunding(c));
      else setLive(null);
    } catch { setLive(null); }
  }, []);

  const fetchData = useCallback(async (c, days, v, d) => {
    // Only HL supports XYZ (stocks/FX/commodities) assets
    if (CRYPTO_ONLY_VENUES.has(v) && isXyz(c)) {
      setData([]); setStats(null); setLive(null);
      setError(`${c} is not available on ${VENUES.find(x => x.id === v)?.label}`);
      return;
    }
    setLoading(true); setLoadingMsg(days > 7 ? `Pagination (${days}d)...` : "Loading...");
    setError(null); setData([]); setStats(null); setLive(null);
    try {
      let raw = [];
      raw = await apiFetchHistory(v, c, days, v === "hl" ? d : null);

      if (!raw.length) throw new Error(`No data for ${c} on ${VENUES.find(x => x.id === v)?.label}`);

      const freq = VENUE_FREQ[v];
      const parsed = raw.map(dt => ({
        time: dt.time, rate: parseFloat(dt.fundingRate) * 100,
        rawRate: dt.fundingRate, rawPremium: dt.premium ?? "0",
        apr: toAPR(dt.fundingRate, freq),
        ratePos: parseFloat(dt.fundingRate) >= 0 ? parseFloat(dt.fundingRate) * 100 : 0,
        rateNeg: parseFloat(dt.fundingRate) < 0 ? parseFloat(dt.fundingRate) * 100 : 0,
      }));
      setData(parsed);
      const rates = parsed.map(dt => dt.rate);
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      const positive = rates.filter(r => r >= 0).length;
      setStats({
        avg, avgApr: avg * freq,
        max: Math.max(...rates), maxApr: Math.max(...rates) * freq,
        min: Math.min(...rates), minApr: Math.min(...rates) * freq,
        positive: ((positive / rates.length) * 100).toFixed(0), count: rates.length,
      });
      loadLive(c, v, d);
    } catch (e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  }, [loadLive]);

  useEffect(() => {
    fetchData(coin, period, venue, hlDex);
    if (liveRef.current) clearInterval(liveRef.current);
    liveRef.current = setInterval(() => loadLive(coin, venue, hlDex), 60000);
    return () => clearInterval(liveRef.current);
  }, [coin, period, venue, hlDex, fetchData, loadLive]);

  const handleCoinSelect = (c) => { setCoin(c); setInputCoin(c); };
  const handleSearch = () => { const c = inputCoin.trim().toUpperCase(); if (c) setCoin(c); };

  const venueInfo = VENUES.find(v2 => v2.id === venue);

  // Market table: filter, sort (favorites first), paginate
  const filteredMarkets = useMemo(() => {
    let rows = marketData;
    if (searchFilter) rows = rows.filter(r => r.coin.toLowerCase().includes(searchFilter.toLowerCase()));
    const sorted = [...rows].sort((a, b) => mktSort.dir * ((a[mktSort.col] ?? -9999) - (b[mktSort.col] ?? -9999)));
    // Favorites always on top
    const favs = sorted.filter(r => favorites.has(r.coin));
    const rest = sorted.filter(r => !favorites.has(r.coin));
    return [...favs, ...rest];
  }, [marketData, searchFilter, mktSort, favorites]);
  const mktTotalPages = Math.max(1, Math.ceil(filteredMarkets.length / MKT_PAGE_SIZE));
  const mktPageData = filteredMarkets.slice(mktPage * MKT_PAGE_SIZE, (mktPage + 1) * MKT_PAGE_SIZE);
  const handleMktSort = (col) => {
    if (mktSort.col === col) setMktSort(s => ({ ...s, dir: -s.dir }));
    else setMktSort({ col, dir: -1 });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      {/* Title row */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 3 }}>
          <h2 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, color: "var(--text)", margin: 0, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
            Explore Funding Rates
          </h2>
          {venue === "hl" && (hlDex !== null || isXyz(coin)) && <span style={{ fontSize: 9, background: "#4a9eff18", border: "1px solid #4a9eff33", borderRadius: 3, padding: "2px 6px", color: "#4a9eff77", letterSpacing: "0.1em" }}>HIP-3{hlDex ? ` · ${hlDex}` : ""}</span>}
        </div>
        <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>Historical And Live Funding Rates For {coin}-PERP</div>
      </div>

      {/* Top assets: 3 highest + 3 lowest */}
      <TopAssetsBar
        items={[
          ...topAssets.map(a => ({ label: a.coin, value: a.avg7, sub: "TOP 7d APR" })),
          ...bottomAssets.map(a => ({ label: a.coin, value: a.avg7, sub: "LOW 7d APR" })),
        ]}
        activeLabel={coin}
        onSelect={c => { setCoin(c); setInputCoin(c); }}
        splitAt={3}
        oiCapSet={oiCapSet}
      />

      {/* Search + Period row above table */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <input value={inputCoin} onChange={e => { setInputCoin(e.target.value.toUpperCase()); setSearchFilter(e.target.value.toUpperCase()); setMktPage(0); }}
          onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Search..."
          style={{ width: 100, background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 8px", outline: "none" }} />
        <button onClick={handleSearch} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "var(--bg)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: "6px 8px", cursor: "pointer" }}>GO</button>
        <div style={{ flex: 1 }} />
        {[{l:"3d",d:3},{l:"7d",d:7},{l:"30d",d:30},{l:"90d",d:90}].map(p => (
          <button key={p.d} onClick={() => setPeriod(p.d)} style={{
            boxSizing: "border-box",
            background: period === p.d ? "#4a9eff22" : "transparent",
            border: `1px solid ${period === p.d ? "#4a9eff" : "var(--border)"}`,
            borderRadius: 4, color: period === p.d ? "#4a9eff" : "var(--text-dim)",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "5px 10px", cursor: "pointer",
          }}>{p.l}</button>
        ))}
      </div>

      {/* Side-by-side: Market table (left) + Chart panel (right) */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 14 }}>
        {/* Left: Market table (narrower) */}
        <div style={{ width: isMobile ? "100%" : "32%", minWidth: isMobile ? 0 : 260, flexShrink: 0 }}>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            {marketLoading && (
              <div style={{ padding: 20, textAlign: "center", color: "#4a9eff", fontSize: 11, letterSpacing: "0.1em" }}>Loading markets…</div>
            )}
            {!marketLoading && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "7px 6px", textAlign: "left", color: "var(--text-label)", fontSize: 8, letterSpacing: "0.1em", fontWeight: 600 }}>ASSET</th>
                      {[{k:"lastRate",l:"RATE"},{k:"apr3",l:"3D"},{k:"apr7",l:"7D"},{k:"apr30",l:"30D"},{k:"apr90",l:"90D"}].map(c => (
                        <th key={c.k} onClick={() => handleMktSort(c.k)} style={{ padding: "7px 4px", textAlign: "right", color: mktSort.col === c.k ? "#4a9eff" : "var(--text-label)", fontSize: 8, letterSpacing: "0.05em", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
                          {c.l} {mktSort.col === c.k ? (mktSort.dir > 0 ? "▲" : "▼") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mktPageData.map((row, rowIdx) => {
                      const isSelected = row.coin === coin;
                      const isFav = favorites.has(row.coin);
                      const rateAPR = row.lastRate != null ? row.lastRate * 100 * freq : null;
                      // Separator line between favorites and non-favorites
                      const prevRow = rowIdx > 0 ? mktPageData[rowIdx - 1] : null;
                      const showSep = prevRow && favorites.has(prevRow.coin) && !isFav;
                      return (
                        <Fragment key={row.coin}>
                          {showSep && <tr><td colSpan={6} style={{ padding: 0, height: 2, background: "#4a9eff33" }} /></tr>}
                          <tr
                            onClick={() => handleCoinSelect(row.coin)}
                            style={{ borderBottom: "1px solid var(--border)", background: isSelected ? "#4a9eff11" : "var(--bg-card)", cursor: "pointer" }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--bg-alt)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "#4a9eff11" : "var(--bg-card)"; }}
                          >
                            <td style={{ padding: "6px 6px", color: isSelected ? "#4a9eff" : "var(--text)", fontWeight: isSelected ? 600 : 400, fontSize: 10, whiteSpace: "nowrap" }}>
                              <span onClick={e => { e.stopPropagation(); toggleFavorite(row.coin); }}
                                style={{ cursor: "pointer", marginRight: 4, fontSize: 11, color: isFav ? "#f0b90b" : "var(--text-muted)", opacity: isFav ? 1 : 0.4 }}
                                title={isFav ? "Remove from favorites" : "Add to favorites"}
                              >{isFav ? "★" : "☆"}</span>
                              {isSelected && <span style={{ color: "#4a9eff", marginRight: 3 }}>›</span>}
                              {row.coin}
                              {oiCapSet.has(row.coin) && <span title="Open Interest cap reached — no new positions can be opened on this asset" style={{ marginLeft: 4, fontSize: 8, opacity: 0.7 }}>🔒</span>}
                            </td>
                          <td style={{ padding: "6px 4px", textAlign: "right", color: (rateAPR ?? 0) >= 0 ? "#16c784" : "#ea3943", fontWeight: 500, fontSize: 9 }}>
                            {rateAPR != null ? fmtAPR(rateAPR) : "—"}
                          </td>
                          <td style={{ padding: "6px 4px", textAlign: "right", color: (row.apr3 ?? 0) >= 0 ? "#16c784" : "#ea3943", fontWeight: 500, fontSize: 9 }}>
                            {row.apr3 != null ? fmtAPR(row.apr3) : "—"}
                          </td>
                          <td style={{ padding: "6px 4px", textAlign: "right", color: (row.apr7 ?? 0) >= 0 ? "#16c784" : "#ea3943", fontWeight: 500, fontSize: 9 }}>
                            {row.apr7 != null ? fmtAPR(row.apr7) : "—"}
                          </td>
                          <td style={{ padding: "6px 4px", textAlign: "right", color: (row.apr30 ?? 0) >= 0 ? "#16c784" : "#ea3943", fontWeight: 500, fontSize: 9 }}>
                            {row.apr30 != null ? fmtAPR(row.apr30) : "—"}
                          </td>
                          <td style={{ padding: "6px 4px", textAlign: "right", color: (row.apr90 ?? 0) >= 0 ? "#16c784" : "#ea3943", fontWeight: 500, fontSize: 9 }}>
                            {row.apr90 != null ? fmtAPR(row.apr90) : "—"}
                          </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {mktPageData.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "var(--text-dim)", fontSize: 10 }}>No markets found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination */}
            {filteredMarkets.length > MKT_PAGE_SIZE && (
              <div style={{ display: "flex", gap: 8, padding: "6px 8px", borderTop: "1px solid var(--border)", alignItems: "center", background: "var(--bg-card)" }}>
                <button onClick={() => setMktPage(p => Math.max(0, p - 1))} disabled={mktPage === 0} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: mktPage === 0 ? "var(--border)" : "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, padding: "3px 8px", cursor: mktPage === 0 ? "default" : "pointer" }}>←</button>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{mktPage + 1}/{mktTotalPages}</span>
                <button onClick={() => setMktPage(p => Math.min(mktTotalPages - 1, p + 1))} disabled={mktPage >= mktTotalPages - 1} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: mktPage >= mktTotalPages - 1 ? "var(--border)" : "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, padding: "3px 8px", cursor: mktPage >= mktTotalPages - 1 ? "default" : "pointer" }}>→</button>
                <span style={{ fontSize: 8, color: "var(--text-muted)", marginLeft: "auto" }}>{filteredMarkets.length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Controls + Stats + Chart (wider) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Controls: MA */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => setShowMA(v => !v)} style={{
                boxSizing: "border-box",
                background: showMA ? "#a78bfa22" : "transparent",
                border: `1px solid ${showMA ? "#a78bfa" : "var(--border)"}`,
                borderRadius: 4, color: showMA ? "#a78bfa" : "var(--text-dim)",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: showMA ? 600 : 400,
                padding: "5px 10px", cursor: "pointer", letterSpacing: "0.05em",
              }}>MA</button>
              {showMA && (
                <>
                  {[["daily","Daily"],["intraday","Intra"]].map(([m, lbl]) => (
                    <button key={m} onClick={() => setMaMode(m)} style={{
                      boxSizing: "border-box",
                      background: maMode === m ? "#a78bfa22" : "transparent",
                      border: `1px solid ${maMode === m ? "#a78bfa" : "var(--border)"}`,
                      borderRadius: 4, color: maMode === m ? "#a78bfa" : "var(--text-dim)",
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: maMode === m ? 600 : 400,
                      padding: "5px 8px", cursor: "pointer",
                    }}>{lbl}</button>
                  ))}
                  {wins.map((w, i) => {
                    const color = MA_COLORS[i % MA_COLORS.length];
                    const active = activeWins.has(w.key);
                    return (
                      <button key={w.key} onClick={() => toggleWin(w.key)} style={{
                        boxSizing: "border-box",
                        background: active ? `${color}22` : "transparent",
                        border: `1px solid ${active ? color : "var(--border)"}`,
                        borderRadius: 4, color: active ? color : "var(--text-muted)",
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: active ? 600 : 400,
                        padding: "5px 8px", cursor: "pointer",
                      }}>{w.label}</button>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <StatCard
                  label="Realtime" live={!!live}
                  value={live ? <span style={{ color: parseFloat(live.funding) >= 0 ? "#16c784" : "#ea3943" }}>{fmtAPR(toAPR(live.funding, VENUE_FREQ[venue]))}</span> : "—"}
                  sub={live ? `Rate: ${fmtRate(live.funding)}` : "Pending..."}
                  color="var(--text)"
                />
                <StatCard label={`Avg ${period}d`} value={<span style={{ color: stats.avgApr >= 0 ? "#16c784" : "#ea3943" }}>{fmtAPR(stats.avgApr)}</span>} sub={`${stats.count} pts`} color={stats.avg >= 0 ? "#16c784" : "#ea3943"} />
                <StatCard label={`Max ${period}d`} value={<span style={{ color: "#16c784" }}>{fmtAPR(stats.maxApr)}</span>} color="#16c784" />
                <StatCard label={`Min ${period}d`} value={<span style={{ color: "#ea3943" }}>{fmtAPR(stats.minApr)}</span>} color="#ea3943" />
                {showMA && maData && maData.length > 0 && (() => {
                  const last = maData[maData.length - 1];
                  return activeWinList.map((w, i) => {
                    const color = MA_COLORS[i % MA_COLORS.length];
                    const val = last[w.key];
                    if (val == null || isNaN(val)) return null;
                    return <StatCard key={w.key} label={w.label} value={<span style={{ color: val >= 0 ? "#00d4aa" : "#ff4d6d" }}>{fmtAPR(val)}</span>} color={color} />;
                  });
                })()}
              </div>
            </div>
          )}

          {/* Chart */}
          {(() => {
            const dayBoundaries = [];
            for (let i = 1; i < data.length; i++) {
              const prevDay = new Date(data[i-1].time).toDateString();
              const currDay = new Date(data[i].time).toDateString();
              if (currDay !== prevDay) dayBoundaries.push(data[i].time);
            }
            const chartData = (showMA && maData && maData.length === data.length)
              ? data.map((d, idx) => ({ ...d, ...maData[idx] }))
              : data;
            return (
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 4px 8px", minHeight: 300, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ fontSize: 10, color: "var(--text)", fontWeight: 600, padding: "0 10px 8px", letterSpacing: "0.02em" }}>{coin}-PERP · {venueInfo?.label}</div>
                {loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a9eff", fontSize: 11, letterSpacing: "0.1em" }}>⟳ {loadingMsg}</div>}
                {error && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4d6d", fontSize: 11, padding: "0 20px", textAlign: "center" }}>⚠ {error}</div>}
                {!loading && !error && chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                      <defs>
                        <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16c784" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#16c784" stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="negGrad" x1="0" y1="1" x2="0" y2="0">
                          <stop offset="5%" stopColor="#ea3943" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#ea3943" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} strokeWidth={0.5} />
                      <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tick={false} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                      <YAxis tickFormatter={v2 => v2.toFixed(4) + "%"} tick={{ fill: "var(--text-muted)", fontSize: 9, fontFamily: "'IBM Plex Mono'" }} tickLine={false} axisLine={false} width={60} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={0} stroke="var(--text)" strokeWidth={0.8} />
                      <Area type="monotone" dataKey="ratePos" fill="url(#posGrad)" stroke="none" />
                      <Area type="monotone" dataKey="rateNeg" fill="url(#negGrad)" stroke="none" />
                      <Line type="monotone" dataKey="rate" stroke={venueInfo?.color ?? "#4a9eff"} strokeWidth={1.2} dot={false} activeDot={{ r: 3, fill: venueInfo?.color ?? "#4a9eff", stroke: "var(--bg)", strokeWidth: 2 }} />
                      {showMA && activeWinList.map((w, i) => {
                        const color = MA_COLORS[i % MA_COLORS.length];
                        return (
                          <Line key={w.key} type="monotone" dataKey={w.key} stroke={color} strokeWidth={1.5 + i * 0.3} dot={false} isAnimationActive={false} connectNulls />
                        );
                      })}
                      {dayBoundaries.map(t => (
                        <ReferenceLine key={t} x={t} stroke="var(--border)" strokeWidth={1} strokeOpacity={1} strokeDasharray="3 6"
                          label={{ value: new Date(t).toLocaleDateString("en", { month: "short", day: "numeric" }), position: "bottom", fill: "var(--text-muted)", fontSize: 8, fontFamily: "'IBM Plex Mono', monospace" }}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
                {!loading && !error && data.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 10 }}>Select a market</div>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Hyperliquid Market Data ── */}
      {hlMarket && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#4a9eff" }}>Hyperliquid</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{hlMarket.coin}-PERP</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 8, background: "#4a9eff18", border: "1px solid #4a9eff33", borderRadius: 3, padding: "1px 5px", color: "#4a9eff77" }}>max {hlMarket.maxLeverage}x</span>
          </div>

          {/* Key metrics */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              { label: "Open Interest", value: hlMarket.openInterestUsd, fmt: v => "$" + (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v / 1e3).toFixed(0) + "K") },
              { label: "Volume 24h", value: hlMarket.dayNtlVlm, fmt: v => "$" + (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v / 1e3).toFixed(0) + "K") },
              { label: "Mark Price", value: hlMarket.markPx, fmt: v => "$" + v.toLocaleString("en", { maximumFractionDigits: v < 1 ? 6 : 2 }) },
              { label: "Oracle Price", value: hlMarket.oraclePx, fmt: v => "$" + v.toLocaleString("en", { maximumFractionDigits: v < 1 ? 6 : 2 }) },
              { label: "Funding (1h)", value: hlMarket.funding, fmt: v => (v >= 0 ? "+" : "") + (v * 100).toFixed(4) + "%", color: v => v >= 0 ? "#16c784" : "#ea3943" },
              { label: "Premium", value: hlMarket.premium, fmt: v => (v >= 0 ? "+" : "") + (v * 100).toFixed(3) + "%", color: v => v >= 0 ? "#16c784" : "#ea3943" },
            ].filter(m => m.value != null).map(m => (
              <div key={m.label} style={{ minWidth: 80 }}>
                <div style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: m.color ? m.color(m.value) : "var(--text)" }}>{m.fmt(m.value)}</div>
              </div>
            ))}
          </div>

          {/* Orderbook liquidity analysis */}
          {hlMarket.orderbook && (
            <>
              <div style={{ fontSize: 8, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                Liquidity Analysis — Spread: {(hlMarket.orderbook.spreadBps / 100).toFixed(3)}%
              </div>

              {/* Price impact table */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Price Impact (slippage)</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "4px 6px", textAlign: "left", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>SIZE</th>
                        <th style={{ padding: "4px 6px", textAlign: "right", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>BUY</th>
                        <th style={{ padding: "4px 6px", textAlign: "right", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>SELL</th>
                        <th style={{ padding: "4px 6px", textAlign: "right", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>AVG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hlMarket.orderbook.impacts.map(imp => {
                        const slipColor = (pct) => pct < 0.05 ? "#16c784" : pct < 0.2 ? "#f0b90b" : pct < 0.5 ? "#ff8fa0" : "#ea3943";
                        return (
                          <tr key={imp.sizeUsd} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                            <td style={{ padding: "3px 6px", color: "var(--text)" }}>${(imp.sizeUsd / 1000).toFixed(0)}K</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: slipColor(imp.buySlippageBps / 100) }}>{(imp.buySlippageBps / 100).toFixed(3)}%</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: slipColor(imp.sellSlippageBps / 100) }}>{(imp.sellSlippageBps / 100).toFixed(3)}%</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 600, color: slipColor(imp.avgSlippageBps / 100) }}>{(imp.avgSlippageBps / 100).toFixed(3)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Depth */}
                <div style={{ minWidth: 160 }}>
                  <div style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Order Book Depth</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "4px 6px", textAlign: "left", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>RANGE</th>
                        <th style={{ padding: "4px 6px", textAlign: "right", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>BIDS</th>
                        <th style={{ padding: "4px 6px", textAlign: "right", color: "var(--text-label)", fontSize: 7, fontWeight: 600 }}>ASKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hlMarket.orderbook.depth.map(d => {
                        const fmtUsd = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : (v / 1e3).toFixed(0) + "K";
                        return (
                          <tr key={d.bps} style={{ borderBottom: "1px solid var(--border-dim)" }}>
                            <td style={{ padding: "3px 6px", color: "var(--text-muted)" }}>+/-{(d.bps / 100).toFixed(1)}%</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#16c784" }}>${fmtUsd(d.bidUsd)}</td>
                            <td style={{ padding: "3px 6px", textAlign: "right", color: "#ea3943" }}>${fmtUsd(d.askUsd)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Market Info (CoinGecko) ── */}
      {coinInfo && coinInfo.found && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            {coinInfo.image && <img src={coinInfo.image} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />}
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{coinInfo.name}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{coinInfo.symbol}</span>
            {coinInfo.marketCapRank && <span style={{ fontSize: 8, background: "#4a9eff18", border: "1px solid #4a9eff33", borderRadius: 3, padding: "1px 5px", color: "#4a9eff77" }}>#{coinInfo.marketCapRank}</span>}
            <div style={{ flex: 1 }} />
            {coinInfo.currentPrice != null && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>${coinInfo.currentPrice.toLocaleString("en", { maximumFractionDigits: coinInfo.currentPrice < 1 ? 6 : 2 })}</span>
            )}
            {coinInfo.priceChange24h != null && (
              <span style={{ fontSize: 10, color: coinInfo.priceChange24h >= 0 ? "#16c784" : "#ea3943", fontWeight: 500 }}>
                {coinInfo.priceChange24h >= 0 ? "+" : ""}{coinInfo.priceChange24h.toFixed(2)}%
              </span>
            )}
          </div>

          {/* Key metrics row */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            {[
              { label: "Market Cap", value: coinInfo.marketCap, fmt: v => "$" + (v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(0) + "M" : v.toLocaleString()) },
              { label: "Volume 24h", value: coinInfo.totalVolume24h, fmt: v => "$" + (v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(0) + "M" : v.toLocaleString()) },
              { label: "7d", value: coinInfo.priceChange7d, fmt: v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", color: v => v >= 0 ? "#16c784" : "#ea3943" },
              { label: "30d", value: coinInfo.priceChange30d, fmt: v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%", color: v => v >= 0 ? "#16c784" : "#ea3943" },
              { label: "ATH", value: coinInfo.ath, fmt: v => "$" + v.toLocaleString("en", { maximumFractionDigits: v < 1 ? 6 : 2 }) },
              { label: "Circ. Supply", value: coinInfo.circulatingSupply, fmt: v => (v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v.toLocaleString()) },
            ].filter(m => m.value != null).map(m => (
              <div key={m.label} style={{ minWidth: 70 }}>
                <div style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: m.color ? m.color(m.value) : "var(--text)" }}>{m.fmt(m.value)}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          {coinInfo.description && (
            <div style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 12, maxHeight: 40, overflow: "hidden" }}>
              {coinInfo.description.replace(/<[^>]*>/g, "")}
            </div>
          )}

          {/* Spot exchanges */}
          {coinInfo.spotExchanges?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 8, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Buy Spot</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {coinInfo.spotExchanges.map(ex => (
                  <a key={ex.name} href={ex.tradeUrl || "#"} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 9, padding: "3px 8px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", textDecoration: "none", cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#4a9eff"; e.currentTarget.style.color = "#4a9eff"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                  >
                    {ex.name}
                    {ex.volume24h != null && <span style={{ color: "var(--text-muted)", marginLeft: 4, fontSize: 8 }}>${ex.volume24h >= 1e6 ? (ex.volume24h / 1e6).toFixed(0) + "M" : (ex.volume24h / 1e3).toFixed(0) + "K"}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Derivatives exchanges */}
          {coinInfo.derivExchanges?.length > 0 && (
            <div>
              <div style={{ fontSize: 8, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Derivatives (Perps)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {coinInfo.derivExchanges.map(ex => (
                  <a key={ex.name} href={ex.tradeUrl || "#"} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 9, padding: "3px 8px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text)", textDecoration: "none" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#a78bfa"; e.currentTarget.style.color = "#a78bfa"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
                  >{ex.name}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {coinInfoLoading && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginTop: 14, textAlign: "center", color: "#4a9eff", fontSize: 10 }}>
          Loading market info...
        </div>
      )}
      {coinInfo && !coinInfo.found && !coinInfoLoading && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", marginTop: 14, fontSize: 9, color: "var(--text-muted)" }}>
          No market info found for {coin} on CoinGecko
        </div>
      )}

      {/* ── Structural Funding Analysis ── */}
      {/* ── Structural Funding ── */}
      {structuralMAs.length > 0 && (() => {
        const meanAPR = structuralMAs.reduce((s, m) => s + m.ma, 0) / structuralMAs.length * freq;
        const thStyle = { textAlign: "center", padding: "4px 4px", color: "var(--text-label)", fontWeight: 500, fontSize: 7, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
        const tdStyle = { textAlign: "center", padding: "3px 4px", fontSize: 9, whiteSpace: "nowrap" };
        return (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
              Structural Funding — {coin}
            </div>

            {/* Horizontal MA table: 19 period columns + Mean */}
            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", minWidth: structuralMAs.length * 52 }}>
                <thead>
                  <tr>
                    {structuralMAs.map(m => (
                      <th key={m.days} style={thStyle}>{m.days}d</th>
                    ))}
                    <th style={{ ...thStyle, color: "#4a9eff", borderLeft: "1px solid var(--border)" }}>Mean</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {structuralMAs.map(m => {
                      const apr = m.ma * freq;
                      return (
                        <td key={m.days} style={{ ...tdStyle, color: apr >= 0 ? "#16c784" : "#ea3943", fontWeight: 600 }}>
                          {apr >= 0 ? "+" : ""}{apr.toFixed(1)}%
                        </td>
                      );
                    })}
                    <td style={{ ...tdStyle, color: meanAPR >= 0 ? "#16c784" : "#ea3943", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>
                      {meanAPR >= 0 ? "+" : ""}{meanAPR.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* MA Curve Chart */}
            <div style={{ fontSize: 7, color: "var(--text-label)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>MA Curve (1d → {structuralMAs[structuralMAs.length - 1].days}d)</div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={structuralMAs.map(m => ({ days: m.days + "d", apr: m.ma * freq }))} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} strokeWidth={0.5} />
                <XAxis dataKey="days" tick={{ fontSize: 8, fill: "var(--text-muted)" }} />
                <YAxis tickFormatter={v => v.toFixed(1) + "%"} tick={{ fontSize: 8, fill: "var(--text-muted)" }} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}>
                      <div style={{ color: "var(--text-muted)" }}>Horizon: {d.days}</div>
                      <div style={{ color: d.apr >= 0 ? "#16c784" : "#ea3943", fontWeight: 600 }}>APR: {d.apr.toFixed(2)}%</div>
                    </div>
                  );
                }} />
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={0.5} />
                <ReferenceLine y={meanAPR} stroke="#4a9eff" strokeDasharray="4 3" strokeWidth={1.5} label={{ value: "Mean " + meanAPR.toFixed(1) + "%", fill: "#4a9eff", fontSize: 8, position: "right" }} />
                <Line type="monotone" dataKey="apr" stroke="#4a9eff" strokeWidth={2} dot={{ r: 2.5, fill: "#4a9eff" }} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

    </div>
  );
}

// ── SPREAD (cross-exchange historical averages) ────────────────────────────────
// Venues available for Spread — Lighter/Asterdex excluded (CORS blocked without backend)
// All venues available for Spread (Lighter/Asterdex CORS handled via backend proxy)
const SPREAD_VENUES = VENUES;

// Generic APR helper using VENUE_FREQ
function venueAvgAPR(data, vid) {
  if (!data || !data.length) return null;
  const freq = VENUE_FREQ[vid];
  return data.reduce((s, d) => s + parseFloat(d.fundingRate), 0) / data.length * 100 * freq;
}

// Legacy helpers kept for backwards compat (used in Compare)
function hlAvgAPR(data) { return venueAvgAPR(data, "hl"); }
function bnAvgAPR(data) { return venueAvgAPR(data, "bn"); }
function byAvgAPR(data) { return venueAvgAPR(data, "by"); }

function aprColor(v) {
  if (v === null) return "#333";
  if (v > 50) return "#00d4aa";
  if (v > 10) return "#7fdfcc";
  if (v > 0) return "#aaa";
  if (v > -10) return "#ff8fa0";
  return "#ff4d6d";
}

function ArbitragePage({ selectedVenues, onNavigate }) {
  const [venueData, setVenueData]       = useState({});
  const [loadingVenues, setLoadingVenues] = useState(new Set());
  const [progressMap, setProgressMap]   = useState({});
  const [sortCol, setSortCol] = useState("hl_bn");
  const [sortDir, setSortDir] = useState(-1);
  const [leverage, setLeverage] = useState(1);
  const [period, setPeriod] = useState("30");
  const abortRefs = useRef({});
  const loadedRef = useRef({});

  const loadVenue = useCallback(async (vid) => {
    if (loadedRef.current[vid]) return;
    loadedRef.current[vid] = true;

    const assets = VENUE_ASSETS[vid] ?? VENUE_ASSETS.bn;
    setLoadingVenues(prev => new Set([...prev, vid]));
    setProgressMap(prev => ({ ...prev, [vid]: { done: 0, total: assets.length } }));

    // Try batch endpoint first (1 request, uses DB cache)
    const batch = await apiFetchVenueBatch(vid, assets, 91);
    if (batch) {
      setVenueData(prev => ({ ...prev, [vid]: batch }));
      setProgressMap(prev => ({ ...prev, [vid]: { done: assets.length, total: assets.length } }));
      setLoadingVenues(prev => { const s = new Set(prev); s.delete(vid); return s; });
      return;
    }

    // Fallback: individual calls
    const now = Date.now();
    const D7  = 7  * 24 * 3600 * 1000;
    const D30 = 30 * 24 * 3600 * 1000;
    const CONCURRENCY = 20;
    const out = [];
    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      const slice = assets.slice(i, i + CONCURRENCY);
      const res = await Promise.all(slice.map(async (coin) => {
        try {
          const d90 = await apiFetchHistory(vid, coin, 91).catch(() => []);
          const d30 = d90.filter(d => d.time >= now - D30);
          const d7  = d30.filter(d => d.time >= now - D7);
          return { coin, apr7: venueAvgAPR(d7, vid), apr30: venueAvgAPR(d30, vid), apr90: venueAvgAPR(d90, vid) };
        } catch { return { coin, apr7: null, apr30: null, apr90: null }; }
      }));
      out.push(...res);
      setProgressMap(prev => ({ ...prev, [vid]: { ...prev[vid], done: Math.min(assets.length, i + CONCURRENCY) } }));
      setVenueData(prev => ({ ...prev, [vid]: [...out] }));
    }
    setLoadingVenues(prev => { const s = new Set(prev); s.delete(vid); return s; });
  }, []);

  // Load data for each selected venue
  useEffect(() => {
    for (const vid of selectedVenues) loadVenue(vid);
  }, [selectedVenues, loadVenue]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(-1); }
  };

  // Ordered list of selected venues (preserving SPREAD_VENUES order)
  const selVenues = SPREAD_VENUES.filter(v => selectedVenues.has(v.id));

  // Spread pairs: all combinations of selected venues
  const spreadPairs = [];
  for (let a = 0; a < selVenues.length; a++) {
    for (let b = a + 1; b < selVenues.length; b++) {
      spreadPairs.push({ key: `${selVenues[a].id}_${selVenues[b].id}`, aV: selVenues[a], bV: selVenues[b] });
    }
  }

  // All coins seen across selected venues
  const periodKey = `apr${period}`;
  const allCoins = [...new Set(selVenues.flatMap(v => venueData[v.id]?.map(r => r.coin) ?? []))];

  const withSpreads = allCoins.map(coin => {
    const row = { coin };
    for (const v of selVenues) {
      const entry = venueData[v.id]?.find(r => r.coin === coin);
      row[v.id] = entry?.[periodKey] ?? null;
    }
    for (const { key, aV, bV } of spreadPairs) {
      const va = row[aV.id], vb = row[bV.id];
      row[key] = (va !== null && vb !== null) ? Math.abs(va - vb) : null;
    }
    return row;
  });

  const sorted = [...withSpreads].sort((a, b) => sortDir * ((a[sortCol] ?? -9999) - (b[sortCol] ?? -9999)));

  const strat = (aId, aVal, bId, bVal) => {
    if (aVal === null || bVal === null) return null;
    return aVal <= bVal ? { longId: aId, shortId: bId } : { longId: bId, shortId: aId };
  };

  const spreadColor = (v) => {
    if (v === null) return "var(--text-dim)";
    if (v > 50) return "#00d4aa";
    if (v > 20) return "#7fdfcc";
    if (v > 5)  return "#aad4c8";
    return "var(--text-muted)";
  };

  const btnStyle = (active, color = "#4a9eff") => ({
    boxSizing: "border-box",
    background: active ? `${color}22` : "transparent",
    border: `1px solid ${active ? color : "var(--border)"}`,
    borderRadius: 4, color: active ? color : "var(--text-dim)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10, fontWeight: active ? 600 : 400,
    padding: "5px 12px", cursor: "pointer", letterSpacing: "0.05em",
  });

  const thStyle = (col, hasBorderLeft) => ({
    padding: "6px 10px", textAlign: "right",
    color: sortCol === col ? "#4a9eff" : "#bbb",
    fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
    fontWeight: sortCol === col ? 700 : 400, cursor: "pointer", userSelect: "none",
    borderLeft: hasBorderLeft ? "1px solid var(--border)" : "none",
  });

  const isLoading = loadingVenues.size > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0", letterSpacing: "-0.02em" }}>
            Find The Highest Spread
          </h2>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>
            Spot Cross-Exchange Funding Rate Arbitrage Opportunities
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { selVenues.forEach(v => { loadedRef.current[v.id] = false; setVenueData(prev => ({ ...prev, [v.id]: undefined })); loadVenue(v.id); }); }} disabled={isLoading} style={{
            background: isLoading ? "transparent" : "#4a9eff22", border: `1px solid ${isLoading ? "var(--border)" : "#4a9eff"}`,
            borderRadius: 4, color: isLoading ? "var(--text-muted)" : "#4a9eff",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "6px 14px", cursor: isLoading ? "default" : "pointer", letterSpacing: "0.08em",
          }}>⟳ REFRESH</button>
          {isLoading && (
            <button onClick={() => SPREAD_VENUES.forEach(v => { abortRefs.current[v.id] = true; })} style={{ background: "#ff4d6d22", border: "1px solid #ff4d6d44", borderRadius: 4, color: "#ff4d6d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>■ STOP</button>
          )}
        </div>
      </div>

      {/* Top spread opportunities */}
      {sorted.length > 0 && spreadPairs.length > 0 && (() => {
        const top5 = [...withSpreads]
          .map(row => {
            const maxSpread = Math.max(...spreadPairs.map(p => row[p.key] ?? 0));
            return { ...row, _maxSpread: maxSpread };
          })
          .sort((a, b) => b._maxSpread - a._maxSpread)
          .slice(0, 5);
        return <TopAssetsBar items={top5.map(r => ({ label: r.coin, value: r._maxSpread * leverage, sub: `Max spread ${period}d` }))} />;
      })()}

      {/* Controls: Period + Leverage */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>Period</span>
          {[["7","7d"],["30","30d"],["90","90d"]].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)} style={btnStyle(period === val)}>{label}</button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Leverage</span>
            <input type="range" min={1} max={10} step={1} value={leverage} onChange={e => setLeverage(Number(e.target.value))}
              style={{ width: 100, accentColor: "#4a9eff", cursor: "pointer" }} />
            <span style={{ fontSize: 11, color: "#4a9eff", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", minWidth: 28 }}>{leverage}×</span>
          </div>
        </div>
      </div>

      {/* Progress bars for loading venues */}
      {[...loadingVenues].map(vid => {
        const prog = progressMap[vid];
        const vInfo = SPREAD_VENUES.find(v => v.id === vid);
        if (!prog) return null;
        return (
          <div key={vid} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: vInfo?.color ?? "#4a9eff", marginBottom: 3, letterSpacing: "0.08em" }}>
              {vInfo?.label}: {prog.done} / {prog.total} assets
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, height: 3, overflow: "hidden" }}>
              <div style={{ background: vInfo?.color ?? "#4a9eff", height: "100%", width: `${(prog.done / prog.total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })}

      {sorted.length > 0 ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", flex: "1 1 auto" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 400 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "7px 12px" }} />
                  <th colSpan={selVenues.length} style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-dim)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>
                    APR avg {period}d
                  </th>
                  {spreadPairs.length > 0 && (
                    <th colSpan={spreadPairs.length} style={{ padding: "6px 10px", textAlign: "center", color: "#4a9eff", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, borderLeft: "1px solid var(--border)" }}>
                      SPREAD {period}d{leverage > 1 ? ` · ${leverage}×` : ""}
                    </th>
                  )}
                  <th style={{ padding: "7px 12px", width: 40 }} />
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "#4a9eff", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Asset</th>
                  {selVenues.map(v => (
                    <th key={v.id} onClick={() => handleSort(v.id)} style={thStyle(v.id, false)}>
                      <span style={{ color: v.color }}>{v.label.slice(0, 4)}</span>
                      {sortCol === v.id ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                    </th>
                  ))}
                  {spreadPairs.map(({ key, aV, bV }, si) => (
                    <th key={key} onClick={() => handleSort(key)} style={thStyle(key, si === 0)}>
                      <span style={{ color: aV.color }}>{aV.label.slice(0, 2)}</span>
                      <span style={{ color: "var(--text-muted)" }}>↔</span>
                      <span style={{ color: bV.color }}>{bV.label.slice(0, 2)}</span>
                      {sortCol === key ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                    </th>
                  ))}
                  <th style={{ padding: "8px 12px", width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.coin} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-alt)" }}>
                    <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 500 }}>{row.coin}</td>
                    {selVenues.map(v => (
                      <td key={v.id} style={{ padding: "7px 10px", textAlign: "right", color: aprColor(row[v.id]), fontWeight: sortCol === v.id ? 600 : 400 }}>
                        {row[v.id] !== null ? fmtAPR(row[v.id]) : "—"}
                      </td>
                    ))}
                    {spreadPairs.map(({ key, aV, bV }, si) => {
                      const spread = row[key];
                      const s = strat(aV.id, row[aV.id], bV.id, row[bV.id]);
                      const vById = { [aV.id]: aV, [bV.id]: bV };
                      return (
                        <td key={key} style={{ padding: "5px 10px", textAlign: "right", borderLeft: si === 0 ? "1px solid var(--border)" : "none", verticalAlign: "middle" }}>
                          {spread !== null ? (
                            <div>
                              <div style={{ color: spreadColor(spread * leverage / 2), fontWeight: sortCol === key ? 700 : 500 }}>
                                {fmtAPR(spread * leverage / 2)}
                              </div>
                              {s && (
                                <div style={{ display: "flex", gap: 3, justifyContent: "flex-end", marginTop: 3 }}>
                                  <span style={{ fontSize: 8, background: "#00d4aa18", border: "1px solid #00d4aa33", borderRadius: 3, padding: "1px 4px", color: "#00d4aa" }}>
                                    L {vById[s.longId]?.label.slice(0,2) ?? s.longId}
                                  </span>
                                  <span style={{ fontSize: 8, background: "#ff4d6d18", border: "1px solid #ff4d6d33", borderRadius: 3, padding: "1px 4px", color: "#ff4d6d" }}>
                                    S {vById[s.shortId]?.label.slice(0,2) ?? s.shortId}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ padding: "7px 12px", textAlign: "center" }}>
                      <button onClick={() => onNavigate(row.coin)} title="Explorer" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 3, color: "#4a9eff", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, padding: "3px 7px", cursor: "pointer" }}>→</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 9, color: "var(--ghost)" }}>
            {sorted.length} assets · L = long (low funding) · S = short (high funding) · Lighter & Asterdex need backend (CORS)
          </div>
        </div>
      ) : !isLoading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ghost)", fontSize: 11, letterSpacing: "0.1em" }}>
          Select venues and load data…
        </div>
      )}
    </div>
  );
}

// ── BOROS / HEDGE ─────────────────────────────────────────────────────────────
const BOROS_BASE = "https://api.boros.finance/core";
const BOROS_CORS_PROXY = "https://corsproxy.io/?url=";

// Try backend proxy → direct fetch → CORS proxy fallback
async function borosFetch(url) {
  // 1. Try backend proxy first (server-side, no CORS issues)
  const borosPath = url.replace(`${BOROS_BASE}/`, "");
  try {
    const r = await fetch(`/api/proxy/boros/${borosPath}`);
    if (r.ok) return r.json();
  } catch {}
  // 2. Try direct fetch
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 401 || r.status === 403) throw new Error(`Boros API ${r.status}`);
  } catch (e) {
    if (/Boros API \d/.test(e.message)) throw e;
  }
  // 3. Last resort: CORS proxy
  const proxyUrl = `${BOROS_CORS_PROXY}${encodeURIComponent(url)}`;
  const r = await fetch(proxyUrl, { headers: { Accept: "application/json", "x-requested-with": "XMLHttpRequest" } });
  if (!r.ok) throw new Error(`Boros API ${r.status}`);
  return r.json();
}

// Fetch all active Boros markets with full APR data (list + per-market detail)
async function fetchBorosMarkets() {
  const listJson = await borosFetch(`${BOROS_BASE}/v1/markets?limit=100&isWhitelisted=true`);
  const list = listJson.results ?? (Array.isArray(listJson) ? listJson : []);
  if (!list.length) return [];

  const now = Date.now() / 1000;
  // Include markets with unknown maturity (null/0) as well as future-expiry
  const active = list.filter(m => !m.imData?.maturity || m.imData.maturity > now);
  if (!active.length) return [];

  const details = await Promise.all(active.map(m =>
    borosFetch(`${BOROS_BASE}/v1/markets/${m.marketId}`).catch(() => null)
  ));

  return details.filter(Boolean).map(m => {
    const raw = m.metadata?.name ?? "";
    const coin = raw.replace(/USDT$/, "").replace(/USD$/, "").replace(/USDC$/, "");
    return {
      name:          m.imData?.name ?? raw,
      coin,
      platform:      m.metadata?.platformName ?? "",
      maturity:      m.imData?.maturity ?? 0,
      impliedApr:    m.data?.impliedApr    ?? m.data?.markApr     ?? null,
      markApr:       m.data?.markApr                              ?? null,
      underlyingApr: m.data?.underlyingApr ?? m.data?.floatingApr ?? null,
      floatingApr:   m.data?.floatingApr                         ?? null,
      midApr:        m.data?.midApr                              ?? null,
      status:        m.data?.state ?? m.data?.marketStatus       ?? "—",
    };
  }).sort((a, b) => a.maturity - b.maturity);
}

function BorosPage({ venue: venueProp }) {
  const isMobile = useIsMobile();
  const [markets, setMarkets]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [sortCol, setSortCol]           = useState("longYU");
  const [sortDir, setSortDir]           = useState(-1);
  const [period, setPeriod]             = useState("live");      // "live" | "7d" | "30d"
  const [fundingAvgs, setFundingAvgs]   = useState({});          // { coin: { apr7, apr30 } }
  const [impliedAvgs, setImpliedAvgs]   = useState({});          // { marketKey: impliedApr7dAvg }
  const [fundingLoading, setFundingLoading] = useState(false);
  const [borosLeverage, setBorosLeverage]   = useState(1);
  const [selectedMarket, setSelectedMarket] = useState(null);   // selected row coin key
  const [chartData, setChartData]           = useState([]);
  const [chartLoading, setChartLoading]     = useState(false);

  // Derive available venues from platforms present in Boros markets data
  const platformToVenueId = { hyperliquid: "hl", binance: "bn", bybit: "by", okx: "okx", dydx: "dy", lighter: "lt", asterdex: "ad" };
  const availableVenueIds = useMemo(() => {
    if (!markets || !markets.length) return ["hl"];
    const ids = new Set();
    markets.forEach(m => {
      const key = m.platform.toLowerCase();
      for (const [k, id] of Object.entries(platformToVenueId)) {
        if (key.includes(k)) { ids.add(id); break; }
      }
    });
    return ids.size ? [...ids] : ["hl"];
  }, [markets]);
  const availableVenues = VENUES.filter(v => availableVenueIds.includes(v.id));
  const selectedVenue = availableVenueIds.includes(venueProp) ? venueProp : availableVenueIds[0];
  const venueObj = VENUES.find(v => v.id === selectedVenue) ?? availableVenues[0] ?? VENUES[0];

  // Fetch Boros markets once
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/boros")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`)))
      .then(data => { setMarkets(data); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, []);

  // Fetch DB funding averages + implied APR averages when venue or markets change
  useEffect(() => {
    if (!markets || !markets.length) return;
    const coins = [...new Set(markets.map(m => m.coin).filter(Boolean))];
    if (!coins.length) return;
    setFundingLoading(true);
    Promise.all([
      fetch(`/api/funding/batch?venue=${selectedVenue}&coins=${coins.join(",")}&days=31`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))),
      fetch("/api/boros/implied-avg").then(r => r.ok ? r.json() : {}),
    ]).then(([fundData, implData]) => {
        const avgs = {};
        fundData.forEach(row => { avgs[row.coin] = { apr7: row.apr7, apr30: row.apr30 }; });
        setFundingAvgs(avgs);
        setImpliedAvgs(implData);
        setFundingLoading(false);
      })
      .catch(() => setFundingLoading(false));
  }, [markets, selectedVenue]);

  // Fetch chart data when a market row is selected
  useEffect(() => {
    if (!selectedMarket) { setChartData([]); return; }
    const coin = selectedMarket;
    const vid = selectedVenue;
    const freq = VENUE_FREQ[vid];
    setChartLoading(true);
    apiFetchHistory(vid, coin, 30).then(raw => {
      if (!raw || !raw.length) { setChartData([]); setChartLoading(false); return; }
      const pts = raw.map(d => ({
        time: d.time,
        funding: parseFloat(d.fundingRate) * 100 * freq,
      }));
      setChartData(pts);
      setChartLoading(false);
    }).catch(() => { setChartData([]); setChartLoading(false); });
  }, [selectedMarket, selectedVenue]);

  // Normalize to % (Boros returns decimals like 0.035 = 3.5%)
  const toPercent = v => (v === null || v === undefined) ? null : v * 100;

  const fmtPct = v => {
    if (v === null || v === undefined) return "—";
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  };
  const fmtDate = ts => {
    if (!ts) return "—";
    const d = new Date(ts * 1000);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  };
  const yuColor = v => {
    if (v === null || v === undefined) return "var(--text-dim)";
    if (v > 5)  return "#00d4aa";
    if (v > 0)  return "#7fdfcc";
    if (v > -5) return "#ff8fa0";
    return "#ff4d6d";
  };

  const thStyle = (col) => ({
    padding: "8px 10px", fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
    color: sortCol === col ? "#4a9eff" : "var(--text-dim)",
    textAlign: col === "coin" ? "left" : "right",
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  });
  const tdStyle = (align = "right") => ({
    padding: "7px 10px", fontSize: 10, color: "var(--text)",
    textAlign: align, borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap",
  });

  // Platform label → venue ID mapping for filtering
  const platformForVenue = { hl: "hyperliquid", bn: "binance", by: "bybit", okx: "okx", dy: "dydx", lt: "lighter", ad: "asterdex" };

  // Build enriched rows with computed columns
  const getUnderlying = (m) => {
    const coin = m.coin;
    if (period === "7d")  return fundingAvgs[coin]?.apr7  ?? null;
    if (period === "30d") return fundingAvgs[coin]?.apr30 ?? null;
    return toPercent(m.underlyingApr);
  };

  const getImplied = (m) => {
    if (period === "7d") {
      const avg = impliedAvgs[m.marketKey];
      return avg !== undefined ? avg * 100 : toPercent(m.impliedApr);
    }
    return toPercent(m.impliedApr);
  };

  const platformFilter = platformForVenue[selectedVenue] ?? "";
  const filteredMarkets = (markets ?? []).filter(m =>
    !platformFilter || m.platform.toLowerCase().includes(platformFilter)
  );

  const withComputed = filteredMarkets.map(m => {
    const implied    = getImplied(m);
    const underlying = getUnderlying(m);
    const longYU  = (underlying !== null && implied !== null) ? underlying - implied : null;
    const shortYU = (underlying !== null && implied !== null) ? implied - underlying : null;
    return { ...m, implied, underlying, longYU, shortYU };
  });

  const sorted = [...withComputed].sort((a, b) => {
    const va = a[sortCol] ?? -9999;
    const vb = b[sortCol] ?? -9999;
    if (typeof va === "string") return sortDir * va.localeCompare(vb);
    return sortDir * (va - vb);
  });

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(-1); }
  };

  // Auto-select best market when data loads and nothing is selected
  useEffect(() => {
    if (!selectedMarket && sorted.length > 0) {
      const best = [...sorted].filter(r => r.longYU != null).sort((a, b) => b.longYU - a.longYU)[0];
      if (best) setSelectedMarket(best.coin);
    }
  }, [sorted, selectedMarket]);

  const underlyingLabel = period === "live" ? "FUNDING RATE" : period === "7d" ? "FUNDING RATE 7D" : "FUNDING RATE 30D";
  const impliedLabel = period === "live" ? "FIXED RATE" : period === "7d" ? "FIXED RATE 7D AVG" : "FIXED RATE (live)";

  const PERIOD_BTNS = [
    { id: "live", label: "Live" },
    { id: "7d",   label: "7d"  },
    { id: "30d",  label: "30d" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0", letterSpacing: "-0.02em" }}>
          Funding Rate Swap
        </h2>
        <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>
          Compare Boros' Fixed Rate (Implied Rate) To The Variable Funding Rate To Find The Best Swaps
        </div>
      </div>

      {/* Top yield opportunities */}
      {!loading && !error && sorted.length > 0 && (() => {
        const top5 = [...sorted].filter(r => r.longYU != null).sort((a, b) => b.longYU - a.longYU).slice(0, 5);
        return <TopAssetsBar
          items={top5.map(r => ({ label: r.coin, value: r.longYU, sub: "Long YU" }))}
          activeLabel={selectedMarket}
          onSelect={c => setSelectedMarket(selectedMarket === c ? null : c)}
        />;
      })()}

      {/* Controls: period + leverage */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>Period</span>
          {PERIOD_BTNS.map(p => {
            const active = period === p.id;
            return (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                style={{
                  boxSizing: "border-box",
                  padding: "5px 12px", fontSize: 10, fontWeight: active ? 600 : 400,
                  fontFamily: "'IBM Plex Mono', monospace",
                  background: active ? "#4a9eff22" : "transparent",
                  border: `1px solid ${active ? "#4a9eff" : "var(--border)"}`,
                  borderRadius: 4, color: active ? "#4a9eff" : "var(--text-dim)",
                  cursor: "pointer", letterSpacing: "0.05em",
                }}>
                {p.label}
              </button>
            );
          })}
          {fundingLoading && <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 6 }}>loading…</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Leverage</span>
            <input type="range" min={1} max={10} step={1} value={borosLeverage} onChange={e => setBorosLeverage(Number(e.target.value))}
              style={{ width: 100, accentColor: "#4a9eff", cursor: "pointer" }} />
            <span style={{ fontSize: 11, color: "#4a9eff", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", minWidth: 28 }}>{borosLeverage}×</span>
          </div>
        </div>
      </div>

      {/* Data area */}
      {loading && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "32px 24px", textAlign: "center", color: "var(--text-dim)", fontSize: 10 }}>
          Loading Boros markets…
        </div>
      )}

      {!loading && error && (
        <div style={{ background: "var(--bg-card)", border: "1px solid #ff4d6d44", borderRadius: 10, padding: "24px", textAlign: "center" }}>
          <div style={{ color: "#ff4d6d", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Failed to load Boros data</div>
          <div style={{ color: "var(--text-dim)", fontSize: 10, marginBottom: 14 }}>{error}</div>
          <a href="https://boros.pendle.finance" target="_blank" rel="noreferrer"
            style={{ display: "inline-block", background: "#a855f722", border: "1px solid #a855f7", borderRadius: 6, color: "#a855f7", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600, padding: "8px 20px", textDecoration: "none", letterSpacing: "0.08em" }}>
            ↗ Open boros.pendle.finance
          </a>
        </div>
      )}

      {!loading && !error && sorted.length === 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "32px 24px", textAlign: "center", color: "var(--text-dim)", fontSize: 10 }}>
          No active markets found.
        </div>
      )}

      {/* Table + Chart side-by-side (desktop) or stacked (mobile) */}
      {!loading && !error && sorted.length > 0 && (
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 14 }}>
          {/* Table — left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-alt)" }}>
                      <th style={thStyle("coin")}       onClick={() => handleSort("coin")}>ASSET {sortCol === "coin"       ? (sortDir < 0 ? "↓" : "↑") : ""}</th>
                      <th style={thStyle("implied")}    onClick={() => handleSort("implied")}>{impliedLabel} {sortCol === "implied"    ? (sortDir < 0 ? "↓" : "↑") : ""}</th>
                      <th style={thStyle("underlying")} onClick={() => handleSort("underlying")}>{underlyingLabel} {sortCol === "underlying" ? (sortDir < 0 ? "↓" : "↑") : ""}</th>
                      <th style={thStyle("longYU")}     onClick={() => handleSort("longYU")}>LONG YU {sortCol === "longYU"     ? (sortDir < 0 ? "↓" : "↑") : ""}</th>
                      <th style={thStyle("shortYU")}    onClick={() => handleSort("shortYU")}>SHORT YU {sortCol === "shortYU"    ? (sortDir < 0 ? "↓" : "↑") : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m, i) => {
                      const isSelected = selectedMarket === m.coin;
                      return (
                      <tr key={i} onClick={() => setSelectedMarket(isSelected ? null : m.coin)}
                        style={{ background: isSelected ? "#4a9eff18" : i % 2 === 0 ? "transparent" : "var(--bg-alt)", cursor: "pointer", transition: "background 0.15s" }}>
                        <td style={{ ...tdStyle("left"), fontWeight: 600, color: isSelected ? "#4a9eff" : "#4a9eff" }}>
                          {m.coin || m.name}{m.collateral ? <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>-{m.collateral}</span> : ""}
                          {m.maturity ? <span style={{ color: "var(--border)", fontWeight: 400, fontSize: 9, marginLeft: 6 }}>{fmtDate(m.maturity)}</span> : ""}
                        </td>
                        <td style={{ ...tdStyle(), color: aprColor(m.implied) }}>{fmtPct(m.implied)}</td>
                        <td style={{ ...tdStyle(), color: aprColor(m.underlying) }}>{fmtPct(m.underlying)}</td>
                        <td style={{ ...tdStyle(), color: yuColor(m.longYU),  fontWeight: 600 }}>{fmtPct(m.longYU)}</td>
                        <td style={{ ...tdStyle(), color: yuColor(m.shortYU), fontWeight: 600 }}>{fmtPct(m.shortYU)}</td>
                      </tr>
                      ); })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 12px", fontSize: 9, color: "var(--text-muted)", borderTop: "1px solid var(--border-dim)", display: "flex", justifyContent: "space-between" }}>
                <span>{sorted.length} active market{sorted.length !== 1 ? "s" : ""} · funding rate: {venueObj.label}{period !== "live" ? ` ${period} avg` : " live"}</span>
                <a href="https://boros.pendle.finance" target="_blank" rel="noreferrer"
                  style={{ color: "#a855f7", textDecoration: "none" }}>↗ boros.pendle.finance</a>
              </div>
            </div>
          </div>

          {/* Chart — right (desktop fixed width, mobile full width) */}
          {selectedMarket && (
            <div style={{ width: isMobile ? "100%" : 380, flexShrink: 0 }}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4a9eff" }}>{selectedMarket}</span>
                    <span style={{ fontSize: 9, color: "var(--text-dim)", marginLeft: 8 }}>30d funding vs fixed · {venueObj.label}</span>
                  </div>
                  <button onClick={() => setSelectedMarket(null)}
                    style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-dim)", fontSize: 9, padding: "3px 8px", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>
                    ✕
                  </button>
                </div>
                {chartLoading ? (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 10, padding: "24px 0" }}>Loading chart data…</div>
                ) : chartData.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 10, padding: "24px 0" }}>No historical data available</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-dim)" />
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                        tick={{ fontSize: 9, fill: "var(--text-dim)" }} stroke="var(--border)" />
                      <YAxis tickFormatter={v => v.toFixed(0) + "%"}
                        tick={{ fontSize: 9, fill: "var(--text-dim)" }} stroke="var(--border)" />
                      <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                      <Tooltip
                        contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}
                        labelFormatter={t => new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        formatter={(val, name) => {
                          const color = name === "funding" ? "#4a9eff" : "#a855f7";
                          const label = name === "funding" ? "Funding Rate" : "Fixed Rate";
                          return [<span style={{ color }}>{val.toFixed(2)}%</span>, label];
                        }}
                      />
                      <Line type="monotone" dataKey="funding" stroke="#4a9eff" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      {(() => {
                        const sel = withComputed.find(m => m.coin === selectedMarket);
                        const fixedRate = sel?.implied;
                        if (fixedRate == null) return null;
                        return <ReferenceLine y={fixedRate} stroke="#a855f7" strokeWidth={1.5} strokeDasharray="6 3"
                          label={{ value: `Fixed ${fmtPct(fixedRate)}`, position: "right", fill: "#a855f7", fontSize: 9 }} />;
                      })()}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── COMPARE ───────────────────────────────────────────────────────────────────
function ComparePage({ selectedVenues, category: filterCat, onNavigate }) {
  // Per-venue data storage: { hl: [{coin, cat, apr7, apr30, apr90}], bn: [...], by: [...] }
  const [venueData, setVenueData] = useState({ hl: null, bn: null, by: null, ad: null });
  const [loadingVenues, setLoadingVenues] = useState(new Set());
  const [progressMap, setProgressMap] = useState({});
  const [sortCol, setSortCol] = useState("hl_apr30");
  const [sortDir, setSortDir] = useState(-1);
  const abortRefs = useRef({ hl: false, bn: false, by: false, ad: false });
  const loadedRef = useRef({ hl: false, bn: false, by: false, ad: false });

  const calcAPR = (data, freq) => {
    if (!data.length) return null;
    return data.reduce((s, d) => s + parseFloat(d.fundingRate), 0) / data.length * 100 * freq;
  };

  const fetchWithRetry = async (fn, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 500 * i));
        const data = await fn();
        if (data.length > 0) return data;
      } catch {}
    }
    return [];
  };

  const loadVenue = useCallback(async (vid) => {
    if (loadedRef.current[vid]) return;
    loadedRef.current[vid] = true;

    const hlCryptoSet = new Set(MARKETS["Crypto"]);
    const assets = vid === "hl"
      ? ALL_ASSETS
      : (_dynVenueAssets[vid]?.filter(c => hlCryptoSet.has(c)) ?? ARBI_ASSETS);
    const freq = VENUE_FREQ[vid];

    setLoadingVenues(prev => new Set([...prev, vid]));
    setProgressMap(prev => ({ ...prev, [vid]: { done: 0, total: assets.length } }));

    // Try batch endpoint first (1 request, uses DB cache)
    const batchResult = await apiFetchVenueBatch(vid, assets, 91);
    if (batchResult) {
      const withCat = batchResult.map(r => ({ ...r, cat: getCat(r.coin) }));
      setVenueData(prev => ({ ...prev, [vid]: withCat }));
      setProgressMap(prev => ({ ...prev, [vid]: { done: assets.length, total: assets.length } }));
      setLoadingVenues(prev => { const s = new Set(prev); s.delete(vid); return s; });
      return;
    }

    // Fallback: individual calls
    const CONCURRENCY = 20;
    const out = [];
    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      const slice = assets.slice(i, i + CONCURRENCY);
      const res = await Promise.all(slice.map(async (coin) => {
        try {
          const d90 = await fetchWithRetry(() => apiFetchHistory(vid, coin, 91));
          const now = Date.now();
          const d30 = d90.filter(d => d.time >= now - 30*24*3600*1000);
          const d7  = d30.filter(d => d.time >= now - 7*24*3600*1000);
          return { coin, cat: getCat(coin), apr7: calcAPR(d7, freq), apr30: calcAPR(d30, freq), apr90: calcAPR(d90, freq) };
        } catch { return { coin, cat: getCat(coin), apr7: null, apr30: null, apr90: null }; }
      }));
      out.push(...res);
      setProgressMap(prev => ({ ...prev, [vid]: { ...prev[vid], done: Math.min(assets.length, i + CONCURRENCY) } }));
      setVenueData(prev => ({ ...prev, [vid]: [...out] }));
    }
    setLoadingVenues(prev => { const s = new Set(prev); s.delete(vid); return s; });
  }, []);

  const refreshVenue = (vid) => {
    loadedRef.current[vid] = false;
    setVenueData(prev => ({ ...prev, [vid]: null }));
    loadVenue(vid);
  };

  // Auto-load HL on mount
  // Load data for each selected venue
  useEffect(() => {
    for (const vid of selectedVenues) loadVenue(vid);
  }, [selectedVenues, loadVenue]);

  const handleSort = (col) => { if (sortCol === col) setSortDir(d => -d); else { setSortCol(col); setSortDir(-1); } };

  // Build merged rows
  const allCoins = [...new Set([
    ...(venueData.hl?.map(r => r.coin) ?? []),
    ...(venueData.bn?.map(r => r.coin) ?? []),
    ...(venueData.by?.map(r => r.coin) ?? []),
    ...(venueData.ad?.map(r => r.coin) ?? []),
  ])];

  const mergedRows = allCoins.map(coin => {
    const hl = venueData.hl?.find(r => r.coin === coin);
    const bn = venueData.bn?.find(r => r.coin === coin);
    const by = venueData.by?.find(r => r.coin === coin);
    const ad = venueData.ad?.find(r => r.coin === coin);
    return {
      coin,
      cat: hl?.cat ?? bn?.cat ?? by?.cat ?? ad?.cat ?? getCat(coin),
      hl_apr7: hl?.apr7 ?? null, hl_apr30: hl?.apr30 ?? null, hl_apr90: hl?.apr90 ?? null,
      bn_apr7: bn?.apr7 ?? null, bn_apr30: bn?.apr30 ?? null, bn_apr90: bn?.apr90 ?? null,
      by_apr7: by?.apr7 ?? null, by_apr30: by?.apr30 ?? null, by_apr90: by?.apr90 ?? null,
      ad_apr7: ad?.apr7 ?? null, ad_apr30: ad?.apr30 ?? null, ad_apr90: ad?.apr90 ?? null,
    };
  });

  const CATS = ["All", ...Object.keys(MARKETS)];
  const sorted = [...mergedRows]
    .filter(r => filterCat === "All" || r.cat === filterCat)
    .sort((a, b) => sortDir * ((a[sortCol] ?? -9999) - (b[sortCol] ?? -9999)));

  const aprColorFn = (v) => {
    if (v === null) return "#333";
    if (v > 50) return "#00d4aa";
    if (v > 10) return "#7fdfcc";
    if (v > 0) return "#aaa";
    if (v > -10) return "#ff8fa0";
    return "#ff4d6d";
  };

  // Venue column groups (only selected venues)
  const venueGroups = VENUES.filter(v2 => selectedVenues.has(v2.id)).map(v2 => ({
    ...v2,
    cols: [
      [`${v2.id}_apr7`, "7d"],
      [`${v2.id}_apr30`, "30d"],
      [`${v2.id}_apr90`, "90d"],
    ],
  }));
  const allCols = venueGroups.flatMap(g => g.cols);

  const isLoading = loadingVenues.size > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0", letterSpacing: "-0.02em" }}>
            Compare Rates Across Venues
          </h2>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>Find The Best Funding Rates Across All Venues And Markets</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { VENUES.forEach(v2 => { if (selectedVenues.has(v2.id)) refreshVenue(v2.id); }); }} disabled={isLoading} style={{
            background: isLoading ? "transparent" : "#4a9eff22", border: `1px solid ${isLoading ? "var(--border)" : "#4a9eff"}`,
            borderRadius: 4, color: isLoading ? "var(--text-muted)" : "#4a9eff",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "6px 14px", cursor: isLoading ? "default" : "pointer", letterSpacing: "0.08em",
          }}>⟳ REFRESH</button>
          {isLoading && (
            <button onClick={() => { VENUES.forEach(v2 => { abortRefs.current[v2.id] = true; }); }} style={{ background: "#ff4d6d22", border: "1px solid #ff4d6d44", borderRadius: 4, color: "#ff4d6d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>■ STOP</button>
          )}
        </div>
      </div>

      {/* Loading status badges */}
      {loadingVenues.size > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[...loadingVenues].map(vid => {
            const prog = progressMap[vid];
            const vInfo = VENUES.find(v2 => v2.id === vid);
            return (
              <span key={vid} style={{ fontSize: 9, color: vInfo?.color ?? "#4a9eff", letterSpacing: "0.06em" }}>
                {vInfo?.label}: {prog ? `${prog.done}/${prog.total}` : "..."}
              </span>
            );
          })}
        </div>
      )}

      {/* Top assets */}
      {sorted.length > 0 && (() => {
        const firstVid = [...selectedVenues][0] ?? "hl";
        const aprKey = `${firstVid}_apr30`;
        const top5 = [...sorted].filter(r => r[aprKey] != null).sort((a, b) => Math.abs(b[aprKey]) - Math.abs(a[aprKey])).slice(0, 5);
        return <TopAssetsBar items={top5.map(r => ({ label: r.coin, value: r[aprKey], sub: `30d · ${(VENUES.find(v2 => v2.id === firstVid))?.label ?? firstVid}` }))} onSelect={c => onNavigate?.(c)} />;
      })()}

      {/* Progress bars */}
      {[...loadingVenues].map(vid => {
        const prog = progressMap[vid];
        const vInfo = VENUES.find(v2 => v2.id === vid);
        if (!prog) return null;
        return (
          <div key={vid} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: vInfo?.color ?? "#4a9eff", marginBottom: 3, letterSpacing: "0.08em" }}>
              {vInfo?.label}: {prog.done} / {prog.total} assets
            </div>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, height: 3, overflow: "hidden" }}>
              <div style={{ background: vInfo?.color ?? "#4a9eff", height: "100%", width: `${(prog.done / prog.total) * 100}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })}

      {/* Table */}
      {sorted.length > 0 ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", flex: "1 1 auto" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 380 }}>
              <thead>
                {/* Venue group header row */}
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th colSpan={3} style={{ padding: "7px 12px" }} />
                  {venueGroups.map((g, gi) => (
                    <th key={g.id} colSpan={3} style={{
                      padding: "6px 10px", textAlign: "center",
                      color: g.color, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600,
                      borderLeft: gi > 0 ? "1px solid var(--border)" : "1px solid var(--border)",
                    }}>{g.label}</th>
                  ))}
                  <th style={{ padding: "7px 12px", width: 40 }} />
                </tr>
                {/* Sub-column row */}
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-label)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 400, width: 28 }}>#</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#4a9eff", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Asset</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--text-dim)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 400 }}>Cat</th>
                  {venueGroups.map((g, gi) =>
                    g.cols.map(([col, label], ci) => (
                      <th key={col} onClick={() => handleSort(col)} style={{
                        padding: "10px 10px", textAlign: "right",
                        color: sortCol === col ? g.color : "#bbb",
                        fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                        fontWeight: sortCol === col ? 700 : 400, cursor: "pointer", userSelect: "none",
                        borderLeft: (gi > 0 && ci === 0) || ci === 0 ? "1px solid var(--border)" : "none",
                      }}>{label}{sortCol === col ? (sortDir === -1 ? " ↓" : " ↑") : ""}</th>
                    ))
                  )}
                  <th style={{ padding: "10px 12px", width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.coin} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-alt)" }}>
                    <td style={{ padding: "7px 12px", color: "var(--ghost)", fontSize: 10 }}>{i + 1}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 500 }}>{row.coin}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text-dim)", fontSize: 10 }}>{row.cat}</td>
                    {venueGroups.map((g, gi) =>
                      g.cols.map(([col], ci) => (
                        <td key={col} style={{
                          padding: "7px 10px", textAlign: "right",
                          color: aprColorFn(row[col]),
                          fontWeight: sortCol === col ? 600 : 400,
                          borderLeft: (gi > 0 && ci === 0) || ci === 0 ? "1px solid var(--border)" : "none",
                        }}>
                          {row[col] !== null ? fmtAPR(row[col]) : "—"}
                        </td>
                      ))
                    )}
                    <td style={{ padding: "7px 12px", textAlign: "center" }}>
                      <button onClick={() => onNavigate(row.coin)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 3, color: "#4a9eff", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, padding: "3px 7px", cursor: "pointer" }}>→</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 9, color: "var(--ghost)", display: "flex", justifyContent: "space-between" }}>
            <span>{sorted.length} assets</span>
            <span>Dernière mise à jour: {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      ) : !isLoading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ghost)", fontSize: 11, letterSpacing: "0.1em" }}>
          Loading data...
        </div>
      )}
    </div>
  );
}

// ── TREND (Moving Averages) ───────────────────────────────────────────────────
const DAILY_WINS = [
  { key: "ma7",  n: 7,  label: "MA 7d"  },
  { key: "ma30", n: 30, label: "MA 30d" },
  { key: "ma90", n: 90, label: "MA 90d" },
];
const INTRADAY_WINS = {
  hl:  [{ key:"p6",  n:6,   label:"6h"  }, { key:"p12", n:12,  label:"12h" }, { key:"p24", n:24,  label:"24h" }, { key:"p72",  n:72,  label:"3d" }, { key:"p168",n:168, label:"7d" }],
  dy:  [{ key:"p6",  n:6,   label:"6h"  }, { key:"p12", n:12,  label:"12h" }, { key:"p24", n:24,  label:"24h" }, { key:"p72",  n:72,  label:"3d" }],
  lt:  [{ key:"p6",  n:6,   label:"6h"  }, { key:"p12", n:12,  label:"12h" }, { key:"p24", n:24,  label:"24h" }],
  bn:  [{ key:"p1",  n:1,   label:"8h"  }, { key:"p3",  n:3,   label:"24h" }, { key:"p9",  n:9,   label:"3d"  }, { key:"p21",  n:21,  label:"7d" }],
  by:  [{ key:"p1",  n:1,   label:"8h"  }, { key:"p3",  n:3,   label:"24h" }, { key:"p9",  n:9,   label:"3d"  }, { key:"p21",  n:21,  label:"7d" }],
  okx: [{ key:"p1",  n:1,   label:"8h"  }, { key:"p3",  n:3,   label:"24h" }, { key:"p9",  n:9,   label:"3d"  }, { key:"p21",  n:21,  label:"7d" }],
  ad:  [{ key:"p1",  n:1,   label:"8h"  }, { key:"p3",  n:3,   label:"24h" }, { key:"p9",  n:9,   label:"3d"  }, { key:"p21",  n:21,  label:"7d" }],
};
const MA_COLORS = ["#4a9eff", "#00d4aa", "#f0b90b", "#ff4d6d", "#a855f7"];


function applyRollingMA(data, windows) {
  return data.map((d, i) => {
    const pt = { time: d.time };
    for (const w of windows) {
      if (i >= w.n - 1) {
        const slice = data.slice(i - w.n + 1, i + 1);
        pt[w.key] = slice.reduce((s, x) => s + x.rate, 0) / w.n;
      } else {
        pt[w.key] = null;
      }
    }
    return pt;
  });
}


// ── DATA (raw funding data + CSV export) ──────────────────────────────────────
function DataPage({ venue, coin, setCoin }) {
  const isMobile = useIsMobile();
  const [inputCoin, setInputCoin] = useState(coin);
  useEffect(() => { setInputCoin(coin); }, [coin]);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tablePage, setTablePage] = useState(0);
  const PAGE_SIZE = 50;
  const { top: topAssets, bottom: bottomAssets } = useTopAssets(venue);

  const fetchData = useCallback(async (c, days, v) => {
    if (CRYPTO_ONLY_VENUES.has(v) && isXyz(c)) {
      setData([]); setError(`${c} is not available on ${VENUES.find(x => x.id === v)?.label}`); return;
    }
    setLoading(true); setError(null); setData([]);
    try {
      const raw = await apiFetchHistory(v, c, days);
      if (!raw.length) throw new Error(`No data for ${c} on ${VENUES.find(x => x.id === v)?.label}`);
      setData(raw);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(coin, period, venue); setTablePage(0); }, [coin, period, venue, fetchData]);

  const handleCoinSelect = (c) => { setCoin(c); setInputCoin(c); };
  const handleSearch = () => { const c = inputCoin.trim().toUpperCase(); if (c) setCoin(c); };

  const freq = VENUE_FREQ[venue] || 8760;
  const tableData = [...data].reverse();
  const totalPages = Math.max(1, Math.ceil(tableData.length / PAGE_SIZE));
  const pageData = tableData.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE);

  const exportCSV = () => {
    const header = "Date,Time,Funding Rate,Premium,APR\n";
    const rows = tableData.map(d => {
      const dt = new Date(d.time);
      const date = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const time = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      const rate = (parseFloat(d.fundingRate) * 100).toFixed(6);
      const premium = ((parseFloat(d.premium ?? 0)) * 100).toFixed(6);
      const apr = toAPR(d.fundingRate, freq).toFixed(2);
      return `${date},${time},${rate}%,${premium}%,${apr}%`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `funding_${coin}_${venue}_${period}d.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, color: "var(--text)", margin: "0 0 3px 0", letterSpacing: "-0.02em" }}>Raw Funding Data</h2>
        <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>Historical Funding Rate Records For {coin}-PERP</div>
      </div>

      <TopAssetsBar
        items={[
          ...topAssets.map(a => ({ label: a.coin, value: a.avg7, sub: "TOP 7d APR" })),
          ...bottomAssets.map(a => ({ label: a.coin, value: a.avg7, sub: "LOW 7d APR" })),
        ]}
        activeLabel={coin}
        onSelect={c => { setCoin(c); setInputCoin(c); }}
        splitAt={3}
      />

      {/* Controls */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>Period</span>
          {[{l:"7d",d:7},{l:"30d",d:30},{l:"90d",d:90}].map(p => (
            <button key={p.d} onClick={() => setPeriod(p.d)} style={{
              boxSizing: "border-box",
              background: period === p.d ? "#4a9eff22" : "transparent",
              border: `1px solid ${period === p.d ? "#4a9eff" : "var(--border)"}`,
              borderRadius: 4, color: period === p.d ? "#4a9eff" : "var(--text-dim)",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "5px 12px", cursor: "pointer",
            }}>{p.l}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={exportCSV} disabled={data.length === 0} style={{
            background: data.length > 0 ? "#16c78422" : "transparent",
            border: `1px solid ${data.length > 0 ? "#16c784" : "var(--border)"}`,
            borderRadius: 4, color: data.length > 0 ? "#16c784" : "var(--text-dim)",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "5px 12px", cursor: data.length > 0 ? "pointer" : "default", letterSpacing: "0.05em",
          }}>EXPORT CSV</button>
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
          <input value={inputCoin} onChange={e => setInputCoin(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Ticker..."
            style={{ width: 80, background: "var(--bg)", border: "1px solid var(--border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "5px 8px", outline: "none" }} />
          <button onClick={handleSearch} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "var(--bg)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: "5px 10px", cursor: "pointer" }}>GO</button>
        </div>
      </div>

      {/* Table */}
      {loading && <div style={{ padding: 20, textAlign: "center", color: "#4a9eff", fontSize: 11, letterSpacing: "0.1em" }}>Loading data…</div>}
      {error && !loading && <div style={{ padding: 20, textAlign: "center", color: "#ff4d6d", fontSize: 11 }}>⚠ {error}</div>}
      {!loading && !error && data.length > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 420 }}>
              <thead>
                <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                  {["Date","Time","Funding Rate","Premium","APR"].map(h => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: h === "Date" || h === "Time" ? "left" : "right", color: "var(--text-label)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map(row => {
                  const r = parseFloat(row.fundingRate);
                  const p = r >= 0;
                  const dt = new Date(row.time);
                  return (
                    <tr key={row.time} style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-alt)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--bg-card)"}
                    >
                      <td style={{ padding: "6px 12px", color: "var(--text-dim)" }}>{dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                      <td style={{ padding: "6px 12px", color: "var(--text-muted)" }}>{dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: p ? "#16c784" : "#ea3943", fontWeight: 500 }}>{(r * 100).toFixed(4)}%</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--text-muted)" }}>{(parseFloat(row.premium ?? 0) * 100).toFixed(4)}%</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", color: p ? "#16c784" : "#ea3943", fontWeight: 500 }}>{fmtAPR(toAPR(row.fundingRate, freq))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid var(--border)", alignItems: "center", background: "var(--bg-card)" }}>
            <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: tablePage === 0 ? "var(--border)" : "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: tablePage === 0 ? "default" : "pointer" }}>←</button>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{tablePage + 1} / {totalPages}</span>
            <button onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))} disabled={tablePage >= totalPages - 1} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: tablePage >= totalPages - 1 ? "var(--border)" : "var(--text-dim)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: tablePage >= totalPages - 1 ? "default" : "pointer" }}>→</button>
            <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: "auto" }}>{tableData.length} entries</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();
  const [page, setPage] = usePersistedState("page", "explorer");
  // Redirect legacy "trend" page to explorer (TrendPage merged into ExplorerPage)
  useEffect(() => { if (page === "trend") setPage("explorer"); }, [page, setPage]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themeMode, setThemeMode] = usePersistedState("themeMode", "auto");
  // Incremented after dynamic asset fetch to trigger re-render across all pages
  const [, setAssetsVersion] = useState(0);

  // ── Shared state: venue / market / coin ──
  const [selectedVenues, setSelectedVenues] = usePersistedState("selectedVenues", ["hl", "bn", "by"]);
  const [category, setCategory] = usePersistedState("globalCategory", "Crypto");
  const [coin, setCoin] = usePersistedState("globalCoin", "BTC");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [hlDex, setHlDex] = useState(null);
  const [perpDexs, setPerpDexs] = useState([]);
  useEffect(() => { fetchPerpDexs().then(setPerpDexs); }, []);

  const selectedVenuesSet = useMemo(() => new Set(selectedVenues), [selectedVenues]);
  const primaryVenue = selectedVenues[0] || "hl";
  const sidebarCoins = useMemo(
    () => prioritizeCoins(primaryVenue, category, getVenueCoins(primaryVenue, category)),
    [primaryVenue, category]
  );

  // Toggle a venue — multi-select on Compare/Spread, single-select elsewhere
  const isMultiVenuePage = page === "compare" || page === "arbi";
  const toggleVenue = useCallback((vid) => {
    if (isMultiVenuePage) {
      setSelectedVenues(prev => {
        if (prev.includes(vid)) {
          if (prev.length <= 1) return prev;
          return prev.filter(v => v !== vid);
        }
        return [...prev, vid];
      });
    } else {
      setSelectedVenues(prev => {
        if (prev[0] === vid) return prev;
        return [vid, ...prev.filter(v => v !== vid)];
      });
    }
  }, [isMultiVenuePage, setSelectedVenues]);

  // Change category, auto-correct coin if not available in the new category
  const handleCategoryChange = useCallback((cat) => {
    setCategory(cat);
    const coins = getVenueCoins(primaryVenue, cat);
    if (coins.length && !coins.includes(coin)) {
      setCoin(coins[0]);
    }
  }, [primaryVenue, coin, setCategory, setCoin]);

  // When primary venue changes to a crypto-only venue, force category to Crypto
  useEffect(() => {
    if (CRYPTO_ONLY_VENUES.has(primaryVenue) && category !== "Crypto") {
      setCategory("Crypto");
    }
  }, [primaryVenue, category, setCategory]);

  // Auto-correct coin when venue or category changes
  useEffect(() => {
    const coins = getVenueCoins(primaryVenue, category);
    if (coins.length && !coins.includes(coin)) {
      setCoin(coins[0]);
    }
  }, [primaryVenue, category, coin, setCoin]);

  const navigateToExplorer = useCallback((c) => { setCoin(c); setPage("explorer"); }, [setCoin, setPage]);

  // Fetch dynamic asset lists on mount; bump version to re-render with updated lists
  useEffect(() => {
    fetchDynamicAssets().then(() => setAssetsVersion(v => v + 1));
  }, []);

  // Apply data-theme attribute when themeMode changes
  useEffect(() => {
    if (themeMode === "auto") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", themeMode);
    }
  }, [themeMode]);

  const cycleTheme = () => {
    setThemeMode(prev => prev === "auto" ? "dark" : prev === "dark" ? "light" : "auto");
  };

  const SIDEBAR_W = isMobile ? 0 : (sidebarOpen ? 220 : 52);
  const VENUE_SHORT = { hl: "HL", bn: "BN", by: "BY", okx: "OKX", dy: "DY", lt: "LT", ad: "AD" };
  const CATEGORY_LIST = ["All", "Crypto", "Stocks", "Commodities", "FX / ETF"];
  const showAssetSelector = false; // table replaces asset selector

  const NAV_ITEMS = [
    { id: "explorer", icon: "◈", label: "Explorer" },
    { id: "compare",  icon: "⊞", label: "Compare" },
    { id: "arbi",     icon: "⇌", label: "Spread" },
    { id: "hedge",    icon: "⊛", label: "Swap" },
    { id: "data",     icon: "⊟", label: "Data" },
  ];

  const navBtnStyle = (id) => ({
    display: "flex",
    alignItems: "center",
    gap: sidebarOpen ? 10 : 0,
    justifyContent: sidebarOpen ? "flex-start" : "center",
    width: "calc(100% - 12px)",
    margin: "0 6px",
    padding: sidebarOpen ? "9px 10px" : "9px 0",
    background: page === id ? "#4a9eff22" : "transparent",
    border: "none",
    borderRadius: 8,
    color: page === id ? "#4a9eff" : "var(--text-muted)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    fontWeight: page === id ? 600 : 400,
    cursor: "pointer",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    overflow: "hidden",
    boxSizing: "border-box",
  });

  const toggleBtnStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "10px 0",
    background: "transparent",
    border: "none",
    borderLeft: "2px solid transparent",
    color: "var(--text-muted)",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 16,
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: "var(--bg)", color: "var(--text)",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        html, body { margin: 0; padding: 0; width: 100%; min-height: 100vh; background: var(--bg); }
        #root { width: 100%; min-height: 100vh; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        button { touch-action: manipulation; }
        input { touch-action: manipulation; }
        @media (max-width: 640px) {
          ::-webkit-scrollbar { width: 3px; height: 3px; }
          ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        }
      `}</style>

      {/* Sidebar — desktop only */}
      {!isMobile && (
        <div style={{ width: SIDEBAR_W + 24, minWidth: SIDEBAR_W + 24, maxWidth: SIDEBAR_W + 24, flexShrink: 0, transition: "width 0.18s ease, min-width 0.18s ease, max-width 0.18s ease" }}>
        <div style={{
          position: "sticky", top: 0, height: "100vh",
          margin: 12, borderRadius: 16,
          border: "1px solid var(--border)",
          background: "var(--bg-card)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.18)",
          width: SIDEBAR_W,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          transition: "width 0.18s ease",
          zIndex: 100,
        }}>
          <button style={toggleBtnStyle} onClick={() => setSidebarOpen(v => !v)}>☰</button>
          <nav style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
            {NAV_ITEMS.map(({ id, icon, label }) => (
              <button key={id} onClick={() => setPage(id)} style={navBtnStyle(id)}>
                <span style={{ fontSize: 14, flexShrink: 0, width: sidebarOpen ? "auto" : "100%", textAlign: "center" }}>{icon}</span>
                {sidebarOpen && <span>{label}</span>}
              </button>
            ))}
          </nav>

          {/* Spacer between nav and filters */}
          <div style={{ flex: "0 0 20px" }} />

          {/* Lower section: venue / market / asset / hip-3 selectors */}
          {sidebarOpen && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
              {/* VENUE */}
              <div>
                <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Venue</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {VENUES.map(v => {
                    const active = isMultiVenuePage ? selectedVenues.includes(v.id) : primaryVenue === v.id;
                    return (
                      <button key={v.id} onClick={() => toggleVenue(v.id)} style={{
                        padding: "4px 8px", fontSize: 9, fontWeight: active ? 600 : 400, fontFamily: "'IBM Plex Mono', monospace",
                        background: active ? v.color + "22" : "transparent",
                        border: `1px solid ${active ? v.color : "var(--border)"}`,
                        borderRadius: 6, color: active ? v.color : "var(--text-muted)",
                        cursor: "pointer", letterSpacing: "0.04em", transition: "all 0.15s",
                        textAlign: "left",
                      }}>
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* MARKET */}
              <div>
                <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Market</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {CATEGORY_LIST.map(cat => {
                    const active = category === cat;
                    const disabled = cat !== "All" && cat !== "Crypto" && CRYPTO_ONLY_VENUES.has(primaryVenue);
                    return (
                      <button key={cat} onClick={() => !disabled && handleCategoryChange(cat)} style={{
                        padding: "4px 8px", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
                        background: active ? "#4a9eff22" : "transparent",
                        border: `1px solid ${active ? "#4a9eff" : "var(--border)"}`,
                        borderRadius: 6, color: active ? "#4a9eff" : disabled ? "var(--ghost)" : "var(--text-muted)",
                        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
                        letterSpacing: "0.04em", transition: "all 0.15s", fontWeight: active ? 600 : 400,
                      }}>
                        {cat === "FX / ETF" ? "FX" : cat === "Commodities" ? "Cmdty" : cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ASSET — only for Explorer */}
              {showAssetSelector && sidebarCoins.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Asset</div>
                  <CoinSelector coins={sidebarCoins} selected={coin} onSelect={setCoin} />
                </div>
              )}

              {/* HIP-3 — only for Explorer on HL */}
              {page === "explorer" && primaryVenue === "hl" && perpDexs.length > 0 && (
                <div>
                  <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>HIP-3</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    <button onClick={() => setHlDex(null)} style={{
                      padding: "4px 8px", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
                      background: hlDex === null ? "#4a9eff22" : "transparent",
                      border: `1px solid ${hlDex === null ? "#4a9eff" : "var(--border)"}`,
                      borderRadius: 4, color: hlDex === null ? "#4a9eff" : "var(--text-muted)",
                      cursor: "pointer", fontWeight: hlDex === null ? 600 : 400,
                    }}>USDC</button>
                    {perpDexs.map(dx => {
                      const name = typeof dx === "string" ? dx : dx?.name;
                      if (!name) return null;
                      const label = dx?.fullName && dx.fullName.length <= 14 ? dx.fullName : name.toUpperCase();
                      return (
                        <button key={name} onClick={() => setHlDex(name)} style={{
                          padding: "4px 8px", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace",
                          background: hlDex === name ? "#4a9eff22" : "transparent",
                          border: `1px solid ${hlDex === name ? "#4a9eff" : "var(--border)"}`,
                          borderRadius: 4, color: hlDex === name ? "#4a9eff" : "var(--text-muted)",
                          cursor: "pointer", fontWeight: hlDex === name ? 600 : 400,
                          letterSpacing: "0.04em", textTransform: "uppercase",
                        }}>{label}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {sidebarOpen && (
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", marginTop: "auto" }}>
              <button onClick={cycleTheme} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "5px 8px", cursor: "pointer", textAlign: "left", letterSpacing: "0.05em" }}>
                {themeMode === "auto" ? "◑ auto" : themeMode === "dark" ? "● dark" : "☀ light"}
              </button>
              <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.08em" }}>v1.0</div>
              <div style={{ fontSize: 9, color: "var(--ghost)", letterSpacing: "0.05em" }}>built by psql</div>
            </div>
          )}
        </div>
        </div>
      )}

      {/* Mobile filter drawer */}
      {isMobile && showMobileFilters && (
        <>
          <div onClick={() => setShowMobileFilters(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 250 }} />
          <div style={{
            position: "fixed", bottom: 56, left: 0, right: 0,
            background: "var(--bg-card)", borderRadius: "16px 16px 0 0",
            border: "1px solid var(--border)", borderBottom: "none",
            padding: "16px 18px", zIndex: 260,
            display: "flex", flexDirection: "column", gap: 14,
            maxHeight: "60vh", overflowY: "auto",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Filters</span>
              <button onClick={() => setShowMobileFilters(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            {/* VENUE */}
            <div>
              <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Venue</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {VENUES.map(v => {
                  const active = isMultiVenuePage ? selectedVenues.includes(v.id) : primaryVenue === v.id;
                  return (
                    <button key={v.id} onClick={() => toggleVenue(v.id)} style={{
                      padding: "6px 10px", fontSize: 10, fontWeight: active ? 600 : 400, fontFamily: "'IBM Plex Mono', monospace",
                      background: active ? v.color + "22" : "transparent",
                      border: `1px solid ${active ? v.color : "var(--border)"}`,
                      borderRadius: 6, color: active ? v.color : "var(--text-muted)",
                      cursor: "pointer",
                    }}>
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* MARKET */}
            <div>
              <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Market</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CATEGORY_LIST.map(cat => {
                  const active = category === cat;
                  const disabled = cat !== "All" && cat !== "Crypto" && CRYPTO_ONLY_VENUES.has(primaryVenue);
                  return (
                    <button key={cat} onClick={() => !disabled && handleCategoryChange(cat)} style={{
                      padding: "6px 10px", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                      background: active ? "#4a9eff22" : "transparent",
                      border: `1px solid ${active ? "#4a9eff" : "var(--border)"}`,
                      borderRadius: 6, color: active ? "#4a9eff" : disabled ? "var(--ghost)" : "var(--text-muted)",
                      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
                      fontWeight: active ? 600 : 400,
                    }}>
                      {cat === "FX / ETF" ? "FX" : cat === "Commodities" ? "Cmdty" : cat}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* ASSET */}
            {showAssetSelector && sidebarCoins.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>Asset</div>
                <CoinSelector coins={sidebarCoins} selected={coin} onSelect={(c) => { setCoin(c); setShowMobileFilters(false); }} />
              </div>
            )}
            {/* HIP-3 */}
            {page === "explorer" && primaryVenue === "hl" && perpDexs.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>HIP-3</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  <button onClick={() => { setHlDex(null); setShowMobileFilters(false); }} style={{
                    padding: "6px 10px", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                    background: hlDex === null ? "#4a9eff22" : "transparent",
                    border: `1px solid ${hlDex === null ? "#4a9eff" : "var(--border)"}`,
                    borderRadius: 4, color: hlDex === null ? "#4a9eff" : "var(--text-muted)",
                    cursor: "pointer", fontWeight: hlDex === null ? 600 : 400,
                  }}>USDC</button>
                  {perpDexs.map(dx => {
                    const name = typeof dx === "string" ? dx : dx?.name;
                    if (!name) return null;
                    const label = dx?.fullName && dx.fullName.length <= 14 ? dx.fullName : name.toUpperCase();
                    return (
                      <button key={name} onClick={() => { setHlDex(name); setShowMobileFilters(false); }} style={{
                        padding: "6px 10px", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
                        background: hlDex === name ? "#4a9eff22" : "transparent",
                        border: `1px solid ${hlDex === name ? "#4a9eff" : "var(--border)"}`,
                        borderRadius: 4, color: hlDex === name ? "#4a9eff" : "var(--text-muted)",
                        cursor: "pointer", fontWeight: hlDex === name ? 600 : 400,
                        textTransform: "uppercase",
                      }}>{label}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Bottom nav bar — mobile only */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, height: 56,
          background: "var(--bg-card)", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "stretch", zIndex: 200,
        }}>
          {NAV_ITEMS.map(({ id, icon, label }) => (
            <button key={id} onClick={() => { setPage(id); setShowMobileFilters(false); }} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3,
              background: page === id ? "#4a9eff18" : "transparent",
              border: "none", borderTop: page === id ? "2px solid #4a9eff" : "2px solid transparent",
              color: page === id ? "#4a9eff" : "var(--text-muted)",
              fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", padding: "6px 0",
            }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span style={{ fontSize: 7, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
            </button>
          ))}
          <button onClick={() => setShowMobileFilters(v => !v)} style={{
            width: 44, display: "flex", alignItems: "center", justifyContent: "center",
            background: showMobileFilters ? "#4a9eff18" : "transparent",
            border: "none", borderTop: showMobileFilters ? "2px solid #4a9eff" : "2px solid transparent",
            color: showMobileFilters ? "#4a9eff" : "var(--text-muted)",
            cursor: "pointer", fontSize: 15, flexShrink: 0,
            fontFamily: "'IBM Plex Mono', monospace",
          }}>
            ⚙
          </button>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "12px 14px" : "clamp(14px,3vw,28px) clamp(16px,4vw,32px)", paddingBottom: isMobile ? 68 : undefined }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          {page === "explorer"
            ? <ExplorerPage key={coin} venue={primaryVenue} category={category === "All" ? "Crypto" : category} coin={coin} setCoin={setCoin} hlDex={hlDex} setHlDex={setHlDex} />
            : page === "compare"
            ? <ComparePage selectedVenues={selectedVenuesSet} category={category} onNavigate={navigateToExplorer} />
            : page === "arbi"
            ? <ArbitragePage selectedVenues={selectedVenuesSet} onNavigate={navigateToExplorer} />
            : page === "data"
            ? <DataPage venue={primaryVenue} coin={coin} setCoin={setCoin} />
            : <BorosPage venue={primaryVenue} />
          }
        </div>
      </div>
    </div>
  );
}
