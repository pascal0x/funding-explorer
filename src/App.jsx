import { useState, useEffect, useCallback, useRef } from "react";
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
const CRYPTO_ONLY_VENUES = new Set(["bn", "by", "okx", "dy", "lt", "ad"]);

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
const VISIBLE_COUNT = 6;
let ALL_ASSETS = [...new Set([
  ...MARKETS["Crypto"], ...MARKETS["Stocks"],
  ...MARKETS["Commodities"], ...MARKETS["FX / ETF"],
])];

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
  if (category !== "Crypto") return [];
  if (_dynVenueAssets[venue]?.length) return _dynVenueAssets[venue];
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
    try {
      const res = await fetch("https://mainnet.zklighter.elliot.ai/api/v1/orderbooks");
      if (!res.ok) { _lighterMarkets = {}; return null; }
      const d = await res.json();
      _lighterMarkets = {};
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
    } catch { _lighterMarkets = {}; }
  }
  return _lighterMarkets[coin] ?? null;
}

async function fetchLighterFundingHistory(coin, days) {
  try {
    const marketId = await getLighterMarketId(coin);
    if (marketId === null) return [];
    const startTime = Math.floor((Date.now() - days * 24 * 3600 * 1000) / 1000);
    const res = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/funding-rates?market_id=${marketId}&start_time=${startTime}&limit=500`
    );
    if (!res.ok) return [];
    const d = await res.json();
    const list = d.funding_rates ?? d.fundingRates ?? (Array.isArray(d) ? d : []);
    return list.map(x => ({
      time: (x.timestamp ?? x.time) * 1000,
      fundingRate: String(x.rate ?? x.funding_rate ?? "0"),
      premium: "0",
    })).sort((a, b) => a.time - b.time);
  } catch { return []; }
}

async function fetchLighterLiveFunding(coin) {
  try {
    const marketId = await getLighterMarketId(coin);
    if (marketId === null) return null;
    const res = await fetch(
      `https://mainnet.zklighter.elliot.ai/api/v1/funding-rates?market_id=${marketId}&limit=1`
    );
    if (!res.ok) return null;
    const d = await res.json();
    const list = d.funding_rates ?? d.fundingRates ?? (Array.isArray(d) ? d : []);
    const last = list[list.length - 1];
    return last ? { funding: String(last.rate ?? last.funding_rate ?? "0"), nextFundingTime: null } : null;
  } catch { return null; }
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
  const res = await fetch("https://fapi.asterdex.com/fapi/v1/exchangeInfo");
  if (!res.ok) return [];
  const data = await res.json();
  return (data.symbols ?? [])
    .filter(s => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
    .map(s => normalizeBase(s.baseAsset)).filter(Boolean);
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
          color: selected === c ? "#4a9eff" : "#bbb",
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
              color: restSelected ? "#4a9eff" : "#bbb",
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
              borderTop: `5px solid ${restSelected ? "#4a9eff" : "#bbb"}`,
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
                      borderBottom: "1px solid #0d1525",
                      color: selected === c ? "#4a9eff" : "#bbb",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      padding: "8px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#1e1e35"; e.currentTarget.style.color = "#ddd"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = selected === c ? "#4a9eff18" : "transparent"; e.currentTarget.style.color = selected === c ? "#4a9eff" : "#bbb"; }}
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

// ── EXPLORER ──────────────────────────────────────────────────────────────────
function ExplorerPage({ initialCoin = "BTC" }) {
  const isMobile = useIsMobile();
  const initCat = () => { for (const [c, l] of Object.entries(MARKETS)) if (l.includes(initialCoin)) return c; return "Crypto"; };
  const [category, setCategory] = usePersistedState("explorerCategory", initCat());
  const [coin, setCoin] = useState(initialCoin);
  const [inputCoin, setInputCoin] = useState(initialCoin);
  const [venue, setVenue] = usePersistedState("explorerVenue", "hl");
  const [hlDex, setHlDex] = useState(null);       // null = main HL USDC; string = HIP-3 dex name
  const [perpDexs, setPerpDexs] = useState([]);   // list from perpDexs API
  const [dexCoins, setDexCoins] = useState([]);   // coins available on current hlDex
  const [period, setPeriod] = useState(7);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [live, setLive] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const TABLE_SIZE = 50;
  const liveRef = useRef(null);

  // Load available HIP-3 DEXs once on mount
  useEffect(() => { fetchPerpDexs().then(setPerpDexs); }, []);

  // When hlDex changes, load its coins and auto-select first one
  useEffect(() => {
    if (hlDex) {
      fetchDexCoins(hlDex).then(coins => {
        setDexCoins(coins);
        if (coins.length > 0) { setCoin(coins[0]); setInputCoin(coins[0]); setTablePage(0); }
      });
    } else {
      setDexCoins([]);
    }
  }, [hlDex]);

  const loadLive = useCallback(async (c, v, d) => {
    try {
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
      if      (v === "hl")  raw = await fetchAllFunding(c, days, d);
      else if (v === "bn")  raw = await fetchBinanceFundingHistory(c, days);
      else if (v === "by")  raw = await fetchBybitFundingHistory(c, days);
      else if (v === "okx") raw = await fetchOkxFundingHistory(c, days);
      else if (v === "dy")  raw = await fetchDydxFundingHistory(c, days);
      else if (v === "lt")  raw = await fetchLighterFundingHistory(c, days);
      else if (v === "ad")  raw = await fetchAsterdexFundingHistory(c, days);

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

  const handleCoinSelect = (c) => { setCoin(c); setInputCoin(c); setTablePage(0); };
  const handleSearch = () => { const c = inputCoin.trim().toUpperCase(); if (c) { setCoin(c); setTablePage(0); } };
  const handleVenueChange = (vid) => {
    setVenue(vid);
    setHlDex(null); // reset to main USDC dex on venue change
    if (vid !== "hl") {
      if (category !== "Crypto") setCategory("Crypto");
      const available = getVenueCoins(vid, "Crypto");
      if (available.length > 0 && !available.includes(coin)) {
        setCoin(available[0]); setInputCoin(available[0]); setTablePage(0);
      }
    }
  };

  const tableData = [...data].reverse();
  const totalPages = Math.ceil(tableData.length / TABLE_SIZE);
  const pageData = tableData.slice(tablePage * TABLE_SIZE, (tablePage + 1) * TABLE_SIZE);

  const venueInfo = VENUES.find(v2 => v2.id === venue);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      {/* Title row */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
          {coin}<span style={{ color: venueInfo?.color ?? "#4a9eff" }}>-PERP</span>
        </span>
        {venue === "hl" && (hlDex !== null || isXyz(coin)) && <span style={{ fontSize: 9, background: "#4a9eff18", border: "1px solid #4a9eff33", borderRadius: 3, padding: "2px 6px", color: "#4a9eff77", letterSpacing: "0.1em" }}>HIP-3{hlDex ? ` · ${hlDex}` : ""}</span>}
      </div>

      {/* Selectors */}
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Venue selector */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>Venue</span>
            {VENUES.map(v2 => (
              <button key={v2.id} onClick={() => handleVenueChange(v2.id)} style={{
                boxSizing: "border-box",
                background: venue === v2.id ? `${v2.color}22` : "transparent",
                border: `1px solid ${venue === v2.id ? v2.color : "var(--border)"}`,
                borderRadius: 4,
                color: venue === v2.id ? v2.color : "#bbb",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10, fontWeight: venue === v2.id ? 600 : 400,
                padding: "5px 12px", cursor: "pointer", letterSpacing: "0.05em",
              }}>{v2.label}</button>
            ))}
          </div>

          {/* DEX sub-selector — only shown for Hyperliquid when HIP-3 DEXs are available */}
          {venue === "hl" && perpDexs.length > 0 && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>HIP-3</span>
              <button onClick={() => setHlDex(null)} style={{
                boxSizing: "border-box",
                background: hlDex === null ? "#4a9eff22" : "transparent",
                border: `1px solid ${hlDex === null ? "#4a9eff" : "var(--border)"}`,
                borderRadius: 4, color: hlDex === null ? "#4a9eff" : "#bbb",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                fontWeight: hlDex === null ? 600 : 400,
                padding: "5px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
              }}>USDC</button>
              {perpDexs.map((dx) => {
                const name = (typeof dx === "string" ? dx : dx?.name);
                if (!name) return null;
                const label = dx?.fullName && dx.fullName.length <= 16 ? dx.fullName : name.toUpperCase();
                return (
                  <button key={name} onClick={() => setHlDex(name)} style={{
                    boxSizing: "border-box",
                    background: hlDex === name ? "#4a9eff22" : "transparent",
                    border: `1px solid ${hlDex === name ? "#4a9eff" : "var(--border)"}`,
                    borderRadius: 4, color: hlDex === name ? "#4a9eff" : "#bbb",
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
                    fontWeight: hlDex === name ? 600 : 400,
                    padding: "5px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
                  }}>{label}</button>
                );
              })}
            </div>
          )}

          {/* Category tabs — non-Crypto disabled for non-HL venues or named dex */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>Market</span>
            {Object.keys(MARKETS).map(cat => {
              const enabled = venue === "hl" && hlDex === null || cat === "Crypto";
              return (
                <button key={cat} onClick={() => { if (!enabled) return; setCategory(cat); handleCoinSelect(MARKETS[cat][0]); }} style={{
                  background: category === cat ? "#4a9eff22" : "transparent",
                  border: `1px solid ${category === cat ? "#4a9eff" : enabled ? "var(--border)" : "var(--border-dim)"}`,
                  borderRadius: 4, color: category === cat ? "#4a9eff" : enabled ? "var(--text-dim)" : "var(--border)",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: category === cat ? 600 : 400,
                  padding: "5px 10px", cursor: enabled ? "pointer" : "not-allowed",
                  letterSpacing: "0.05em", textTransform: "uppercase", opacity: enabled ? 1 : 0.3,
                }}>{cat}</button>
              );
            })}
          </div>

          {/* Coin selector */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", width: 44, flexShrink: 0 }}>Asset</span>
            <CoinSelector
              coins={hlDex ? dexCoins : getVenueCoins(venue, category)}
              selected={coin}
              onSelect={handleCoinSelect}
            />
          </div>
        </div>
      </div>

      {/* Stats + controls row */}
      {stats && (
        <div style={{ marginBottom: 12, width: "100%" }}>
          {/* On mobile: period + search in a compact top row */}
          {isMobile && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
              {[{l:"7d",d:7},{l:"30d",d:30},{l:"90d",d:90}].map(p => (
                <button key={p.d} onClick={() => setPeriod(p.d)} style={{
                  boxSizing: "border-box",
                  background: period === p.d ? "#4a9eff22" : "transparent",
                  border: `1px solid ${period === p.d ? "#4a9eff" : "var(--border)"}`,
                  borderRadius: 4, color: period === p.d ? "#4a9eff" : "var(--text-dim)",
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "6px 12px", cursor: "pointer",
                }}>{p.l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <input value={inputCoin} onChange={e => setInputCoin(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Ticker..."
                style={{ width: 80, background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "6px 8px", outline: "none" }} />
              <button onClick={handleSearch} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "var(--bg)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>GO</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, width: "100%" }}>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
              <StatCard
                label="Realtime" live={!!live}
                value={live ? <span style={{ color: parseFloat(live.funding) >= 0 ? "#16c784" : "#ea3943" }}>{(parseFloat(live.funding) * 100).toFixed(4)}%</span> : "—"}
                sub={live ? `APR: ${fmtAPR(toAPR(live.funding, VENUE_FREQ[venue]))}` : "Pending..."}
                color="var(--text)"
              />
              <StatCard label={`Avg ${period}d`} value={fmtRate(stats.avg / 100)} sub={`APR: ${fmtAPR(stats.avgApr)}`} color={stats.avg >= 0 ? "#16c784" : "#ea3943"} />
              <StatCard label={`Max ${period}d`} value={fmtRate(stats.max / 100)} sub={`APR: ${fmtAPR(stats.maxApr)}`} color="#16c784" />
              <StatCard label={`Min ${period}d`} value={fmtRate(stats.min / 100)} sub={`APR: ${fmtAPR(stats.minApr)}`} color="#ea3943" />
              <StatCard label="% Positive" value={stats.positive + "%"} sub={`${stats.count} pts · ${period}d`} color="#4a9eff" />
            </div>
            {/* Period + search — desktop only (on mobile shown above) */}
            {!isMobile && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[{l:"7d",d:7},{l:"30d",d:30},{l:"90d",d:90}].map(p => (
                    <button key={p.d} onClick={() => setPeriod(p.d)} style={{
                      boxSizing: "border-box", flex: 1,
                      background: period === p.d ? "#4a9eff22" : "transparent",
                      border: `1px solid ${period === p.d ? "#4a9eff" : "var(--border)"}`,
                      borderRadius: 4, color: period === p.d ? "#4a9eff" : "var(--text-dim)",
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "5px 10px", cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}>{p.l}</button>
                  ))}
                </div>
                <div style={{ display: "flex" }}>
                  <input value={inputCoin} onChange={e => setInputCoin(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Ticker..."
                    style={{ flex: 1, minWidth: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "5px 8px", outline: "none" }} />
                  <button onClick={handleSearch} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "var(--bg)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>GO</button>
                </div>
              </div>
            )}
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
        return (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 4px 10px", height: 320, display: "flex", flexDirection: "column", marginBottom: 12, overflow: "hidden", minWidth: 0, width: "100%" }}>
            {loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a9eff", fontSize: 11, letterSpacing: "0.1em" }}>⟳ {loadingMsg}</div>}
            {error && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4d6d", fontSize: 11, padding: "0 20px", textAlign: "center" }}>⚠ {error}</div>}
            {!loading && !error && data.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#0d1d35" vertical={false} />
                  <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tick={false} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis tickFormatter={v2 => v2.toFixed(4) + "%"} tick={{ fill: "#bbb", fontSize: 9, fontFamily: "'IBM Plex Mono'" }} tickLine={false} axisLine={false} width={68} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} stroke="#2a4a6f" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="ratePos" fill="url(#posGrad)" stroke="none" />
                  <Area type="monotone" dataKey="rateNeg" fill="url(#negGrad)" stroke="none" />
                  <Line type="monotone" dataKey="rate" stroke={venueInfo?.color ?? "#4a9eff"} strokeWidth={1.2} dot={false} activeDot={{ r: 3, fill: venueInfo?.color ?? "#4a9eff", stroke: "var(--bg)", strokeWidth: 2 }} />
                  {dayBoundaries.map(t => (
                    <ReferenceLine key={t} x={t} stroke="var(--border)" strokeWidth={1} strokeOpacity={1} strokeDasharray="3 6" ifOverflowVisible
                      label={{ value: new Date(t).toLocaleDateString("en", { month: "short", day: "numeric" }), position: "insideBottomRight", fill: "#4a9effaa", fontSize: 8, fontFamily: "'IBM Plex Mono', monospace" }}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      })()}

      {/* Table */}
      {data.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => { setShowTable(v2 => !v2); setTablePage(0); }} style={{ background: showTable ? "#4a9eff22" : "transparent", border: "1px solid var(--border)", borderRadius: 4, color: showTable ? "#4a9eff" : "#bbb", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {showTable ? "▲ Hide" : "▼ Display the funding fee history"}
          </button>
        </div>
      )}
      {showTable && data.length > 0 && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 360 }}>
              <thead>
                <tr style={{ background: "#020617", borderBottom: "1px solid #1e293b" }}>
                  {["Date","Time","Rate","Premium","APR"].map(h => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#94a3b8", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((row) => {
                  const p = row.rate >= 0; const d = new Date(row.time);
                  return (
                    <tr key={row.time}
                      style={{ borderBottom: "1px solid #1e293b", background: "#0f172a" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#111827"}
                      onMouseLeave={e => e.currentTarget.style.background = "#0f172a"}
                    >
                      <td style={{ padding: "6px 12px", color: "#94a3b8" }}>{d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                      <td style={{ padding: "6px 12px", color: "#64748b" }}>{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ padding: "6px 12px", color: p ? "#16c784" : "#ea3943", fontWeight: 500 }}>{fmtRate(row.rawRate)}</td>
                      <td style={{ padding: "6px 12px", color: "#94a3b8" }}>{(parseFloat(row.rawPremium) * 100).toFixed(4)}%</td>
                      <td style={{ padding: "6px 12px", color: p ? "#16c784" : "#ea3943", fontWeight: 500 }}>{fmtAPR(row.apr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid #1e293b", alignItems: "center", background: "#0f172a" }}>
            <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0} style={{ background: "transparent", border: "1px solid #1e293b", borderRadius: 4, color: tablePage === 0 ? "#1e293b" : "#94a3b8", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: tablePage === 0 ? "default" : "pointer" }}>←</button>
            <span style={{ fontSize: 10, color: "#64748b" }}>{tablePage + 1} / {totalPages}</span>
            <button onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))} disabled={tablePage >= totalPages - 1} style={{ background: "transparent", border: "1px solid #1e293b", borderRadius: 4, color: tablePage >= totalPages - 1 ? "#1e293b" : "#94a3b8", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: tablePage >= totalPages - 1 ? "default" : "pointer" }}>→</button>
            <span style={{ fontSize: 9, color: "#334155", marginLeft: "auto" }}>{tableData.length} entries</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ARBI (cross-exchange historical averages) ─────────────────────────────────
// Updated dynamically by fetchDynamicAssets() → HL crypto ∩ BN ∩ BY
let ARBI_ASSETS = [
  "BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF",
  "HYPE","PEPE","TRUMP","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP",
];

// APR helpers — HL 1h intervals, BN/BY 8h intervals
function hlAvgAPR(data) {
  if (!data.length) return null;
  return data.reduce((s, d) => s + parseFloat(d.fundingRate), 0) / data.length * 100 * 24 * 365;
}
function bnAvgAPR(data) {
  if (!data.length) return null;
  return data.reduce((s, d) => s + parseFloat(d.fundingRate), 0) / data.length * 100 * 3 * 365;
}
function byAvgAPR(data) {
  if (!data.length) return null;
  return data.reduce((s, d) => s + parseFloat(d.fundingRate), 0) / data.length * 100 * 3 * 365;
}

function aprColor(v) {
  if (v === null) return "#333";
  if (v > 50) return "#00d4aa";
  if (v > 10) return "#7fdfcc";
  if (v > 0) return "#aaa";
  if (v > -10) return "#ff8fa0";
  return "#ff4d6d";
}

function ArbitragePage({ onNavigate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortCol, setSortCol] = useState("hl30");
  const [sortDir, setSortDir] = useState(-1);
  const abortRef = useRef(false);
  const hasLoaded = useRef(false);

  const runLoad = useCallback(async () => {
    setLoading(true);
    abortRef.current = false;
    setRows([]);
    setProgress({ done: 0, total: ARBI_ASSETS.length });
    const now = Date.now();
    const D7  = 7  * 24 * 3600 * 1000;
    const D30 = 30 * 24 * 3600 * 1000;
    const out = [];
    const CONCURRENCY = 2;

    for (let i = 0; i < ARBI_ASSETS.length; i += CONCURRENCY) {
      if (abortRef.current) break;
      const batch = ARBI_ASSETS.slice(i, i + CONCURRENCY);
      const batchRes = await Promise.all(batch.map(async (coin) => {
        try {
          const [hlRaw, bnRaw, byRaw] = await Promise.all([
            fetchAllFunding(coin, 90).catch(() => []),
            fetchBinanceFundingHistory(coin, 91).catch(() => []),
            fetchBybitFundingHistory(coin, 91).catch(() => []),
          ]);

          const hl7  = hlRaw.filter(d => d.time  >= now - D7);
          const hl30 = hlRaw.filter(d => d.time  >= now - D30);
          const bn7  = bnRaw.filter(d => d.time  >= now - D7);
          const bn30 = bnRaw.filter(d => d.time  >= now - D30);
          const by7  = byRaw.filter(d => d.time  >= now - D7);
          const by30 = byRaw.filter(d => d.time  >= now - D30);

          return {
            coin,
            hl7:  hlAvgAPR(hl7),  hl30:  hlAvgAPR(hl30),  hl90:  hlAvgAPR(hlRaw),
            bn7:  bnAvgAPR(bn7),  bn30:  bnAvgAPR(bn30),  bn90:  bnAvgAPR(bnRaw),
            by7:  byAvgAPR(by7),  by30:  byAvgAPR(by30),  by90:  byAvgAPR(byRaw),
          };
        } catch {
          return { coin, hl7:null,hl30:null,hl90:null, bn7:null,bn30:null,bn90:null, by7:null,by30:null,by90:null };
        }
      }));
      out.push(...batchRes);
      setProgress(p => ({ ...p, done: Math.min(p.total, i + CONCURRENCY) }));
      setRows([...out]);
      if (i + CONCURRENCY < ARBI_ASSETS.length) await new Promise(r => setTimeout(r, 200));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) { hasLoaded.current = true; runLoad(); }
  }, [runLoad]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(-1); }
  };

  const sorted = [...rows].sort((a, b) => sortDir * ((a[sortCol] ?? -9999) - (b[sortCol] ?? -9999)));

  const groups = [
    { label: "Hyperliquid", color: "#4a9eff", cols: [["hl7","7d"],["hl30","30d"],["hl90","90d"]] },
    { label: "Binance",     color: "#f0b90b", cols: [["bn7","7d"],["bn30","30d"],["bn90","90d"]] },
    { label: "Bybit",       color: "#e6a817", cols: [["by7","7d"],["by30","30d"],["by90","90d"]] },
  ];
  const allCols = groups.flatMap(g => g.cols);

  const thStyle = (col, first) => ({
    padding: "6px 10px", textAlign: "right",
    color: sortCol === col ? "#4a9eff" : "#bbb",
    fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
    fontWeight: sortCol === col ? 700 : 400, cursor: "pointer", userSelect: "none",
    borderLeft: first ? "1px solid #0d1525" : "none",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: "0 0 3px 0" }}>
            Spread<span style={{ color: "#4a9eff" }}> · cross-exchange</span>
          </h2>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>
            Avg APR 7d / 30d / 90d — HL 1h×24×365 · Binance/Bybit 8h×3×365 · click column to sort
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runLoad} disabled={loading} style={{
            background: loading ? "transparent" : "#4a9eff22", border: `1px solid ${loading ? "var(--border)" : "#4a9eff"}`,
            borderRadius: 4, color: loading ? "#333" : "#4a9eff",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "6px 14px", cursor: loading ? "default" : "pointer", letterSpacing: "0.08em",
          }}>⟳ REFRESH</button>
          {loading && (
            <button onClick={() => abortRef.current = true} style={{ background: "#ff4d6d22", border: "1px solid #ff4d6d44", borderRadius: 4, color: "#ff4d6d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>■ STOP</button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "#4a9eff", marginBottom: 4, letterSpacing: "0.08em" }}>
            {progress.done} / {progress.total} assets loaded
          </div>
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 4, height: 3, overflow: "hidden" }}>
            <div style={{ background: "#4a9eff", height: "100%", width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {sorted.length > 0 ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", flex: "1 1 auto" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 740 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #0d1525" }}>
                  <th style={{ padding: "7px 12px" }} />
                  {groups.map((g, gi) => (
                    <th key={g.label} colSpan={3} style={{
                      padding: "6px 10px", textAlign: "center",
                      color: g.color, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600,
                      borderLeft: gi > 0 ? "1px solid #0d1525" : "none",
                    }}>{g.label}</th>
                  ))}
                  <th style={{ padding: "7px 12px", width: 40 }} />
                </tr>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", color: "#4a9eff", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Asset</th>
                  {groups.map((g, gi) =>
                    g.cols.map(([col, label], ci) => (
                      <th key={col} onClick={() => handleSort(col)} style={thStyle(col, gi > 0 && ci === 0)}>
                        {label}{sortCol === col ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                      </th>
                    ))
                  )}
                  <th style={{ padding: "8px 12px", width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.coin} style={{ borderBottom: "1px solid #0d1525", background: i % 2 === 0 ? "transparent" : "var(--bg-alt)" }}>
                    <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 500 }}>{row.coin}</td>
                    {allCols.map(([col], ci) => {
                      const isFirstOfGroup = ci === 3 || ci === 6;
                      return (
                        <td key={col} style={{
                          padding: "7px 10px", textAlign: "right",
                          color: aprColor(row[col]),
                          fontWeight: sortCol === col ? 600 : 400,
                          borderLeft: isFirstOfGroup ? "1px solid #0d1525" : "none",
                        }}>
                          {row[col] !== null ? fmtAPR(row[col]) : "—"}
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
          <div style={{ padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 9, color: "var(--ghost)", display: "flex", justifyContent: "space-between" }}>
            <span>{sorted.length} assets · HL vs Binance Futures vs Bybit Linear · — = unavailable</span>
          </div>
        </div>
      ) : !loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ghost)", fontSize: 11, letterSpacing: "0.1em" }}>
          Loading cross-exchange data...
        </div>
      )}
    </div>
  );
}

// ── COMPARE ───────────────────────────────────────────────────────────────────
function ComparePage({ onNavigate }) {
  // Per-venue data storage: { hl: [{coin, cat, apr7, apr30, apr90}], bn: [...], by: [...] }
  const [venueData, setVenueData] = useState({ hl: null, bn: null, by: null, ad: null });
  const [loadingVenues, setLoadingVenues] = useState(new Set());
  const [progressMap, setProgressMap] = useState({});
  const [selectedVenues, setSelectedVenues] = useState(new Set(["hl"]));
  const [sortCol, setSortCol] = useState("hl_apr30");
  const [sortDir, setSortDir] = useState(-1);
  const [filterCat, setFilterCat] = useState("All");
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
    abortRefs.current[vid] = false;

    // For non-HL venues: use dynamic list filtered to HL crypto (meaningful cross-venue comparison)
    const hlCryptoSet = new Set(MARKETS["Crypto"]);
    const assets = vid === "hl"
      ? ALL_ASSETS
      : (_dynVenueAssets[vid]?.filter(c => hlCryptoSet.has(c)) ?? ARBI_ASSETS);
    const freq = VENUE_FREQ[vid];
    const CONCURRENCY = 2;

    setLoadingVenues(prev => new Set([...prev, vid]));
    setProgressMap(prev => ({ ...prev, [vid]: { done: 0, total: assets.length } }));

    const out = [];
    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      if (abortRefs.current[vid]) break;
      const batch = assets.slice(i, i + CONCURRENCY);
      const batchRes = await Promise.all(batch.map(async (coin) => {
        try {
          let d90 = [];
          if (vid === "hl") d90 = await fetchWithRetry(() => fetchAllFunding(coin, 90));
          else if (vid === "bn") d90 = await fetchWithRetry(() => fetchBinanceFundingHistory(coin, 91));
          else if (vid === "by") d90 = await fetchWithRetry(() => fetchBybitFundingHistory(coin, 91));
          else if (vid === "ad") d90 = await fetchWithRetry(() => fetchAsterdexFundingHistory(coin, 91));

          const now = Date.now();
          const d30 = d90.filter(d => d.time >= now - 30*24*3600*1000);
          const d7  = d30.filter(d => d.time >= now - 7*24*3600*1000);
          return { coin, cat: getCat(coin), apr7: calcAPR(d7, freq), apr30: calcAPR(d30, freq), apr90: calcAPR(d90, freq) };
        } catch { return { coin, cat: getCat(coin), apr7: null, apr30: null, apr90: null }; }
      }));
      out.push(...batchRes);
      setProgressMap(prev => ({ ...prev, [vid]: { ...prev[vid], done: Math.min(assets.length, i + CONCURRENCY) } }));
      setVenueData(prev => ({ ...prev, [vid]: [...out] }));
      if (i + CONCURRENCY < assets.length) await new Promise(r => setTimeout(r, 150));
    }

    setLoadingVenues(prev => { const s = new Set(prev); s.delete(vid); return s; });
  }, []);

  const toggleVenue = (vid) => {
    setSelectedVenues(prev => {
      const next = new Set(prev);
      if (next.has(vid)) {
        if (next.size === 1) return next; // keep at least one
        next.delete(vid);
        // update sort col if it belongs to removed venue
        setSortCol(sc => sc.startsWith(vid + "_") ? "hl_apr30" : sc);
      } else {
        next.add(vid);
        if (!loadedRef.current[vid]) loadVenue(vid);
      }
      return next;
    });
  };

  const refreshVenue = (vid) => {
    loadedRef.current[vid] = false;
    setVenueData(prev => ({ ...prev, [vid]: null }));
    loadVenue(vid);
  };

  // Auto-load HL on mount
  useEffect(() => { loadVenue("hl"); }, [loadVenue]);

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
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: "0 0 3px 0" }}>
            Compare APR<span style={{ color: "#4a9eff" }}> · all markets</span>
          </h2>
          <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.08em" }}>Avg APR 7d / 30d / 90d — click column to sort</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => { VENUES.forEach(v2 => { if (selectedVenues.has(v2.id)) refreshVenue(v2.id); }); }} disabled={isLoading} style={{
            background: isLoading ? "transparent" : "#4a9eff22", border: `1px solid ${isLoading ? "var(--border)" : "#4a9eff"}`,
            borderRadius: 4, color: isLoading ? "#333" : "#4a9eff",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "6px 14px", cursor: isLoading ? "default" : "pointer", letterSpacing: "0.08em",
          }}>⟳ REFRESH</button>
          {isLoading && (
            <button onClick={() => { VENUES.forEach(v2 => { abortRefs.current[v2.id] = true; }); }} style={{ background: "#ff4d6d22", border: "1px solid #ff4d6d44", borderRadius: 4, color: "#ff4d6d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>■ STOP</button>
          )}
        </div>
      </div>

      {/* Venue checkboxes */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Venues</span>
        {VENUES.map(v2 => {
          const checked = selectedVenues.has(v2.id);
          const loading2 = loadingVenues.has(v2.id);
          const prog = progressMap[v2.id];
          return (
            <label key={v2.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
              <div
                onClick={() => toggleVenue(v2.id)}
                style={{
                  width: 14, height: 14, borderRadius: 3,
                  border: `1px solid ${checked ? v2.color : "var(--border)"}`,
                  background: checked ? `${v2.color}33` : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                {checked && <span style={{ color: v2.color, fontSize: 10, lineHeight: 1, fontWeight: 700 }}>✓</span>}
              </div>
              <span
                onClick={() => toggleVenue(v2.id)}
                style={{ fontSize: 11, color: checked ? v2.color : "#bbb", fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {v2.label}
              </span>
              {loading2 && prog && (
                <span style={{ fontSize: 9, color: "var(--text-label)" }}>({prog.done}/{prog.total})</span>
              )}
            </label>
          );
        })}
      </div>

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

      {/* Category filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {CATS.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            background: filterCat === cat ? "#4a9eff22" : "transparent",
            border: `1px solid ${filterCat === cat ? "#4a9eff" : "var(--border)"}`,
            borderRadius: 4, color: filterCat === cat ? "#4a9eff" : "#bbb",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            padding: "5px 10px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em",
          }}>{cat}</button>
        ))}
      </div>

      {/* Table */}
      {sorted.length > 0 ? (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", flex: "1 1 auto" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 380 }}>
              <thead>
                {/* Venue group header row */}
                <tr style={{ borderBottom: "1px solid #0d1525" }}>
                  <th colSpan={3} style={{ padding: "7px 12px" }} />
                  {venueGroups.map((g, gi) => (
                    <th key={g.id} colSpan={3} style={{
                      padding: "6px 10px", textAlign: "center",
                      color: g.color, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600,
                      borderLeft: gi > 0 ? "1px solid #0d1525" : "1px solid #0d1525",
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
                        borderLeft: (gi > 0 && ci === 0) || ci === 0 ? "1px solid #0d1525" : "none",
                      }}>{label}{sortCol === col ? (sortDir === -1 ? " ↓" : " ↑") : ""}</th>
                    ))
                  )}
                  <th style={{ padding: "10px 12px", width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.coin} style={{ borderBottom: "1px solid #0d1525", background: i % 2 === 0 ? "transparent" : "var(--bg-alt)" }}>
                    <td style={{ padding: "7px 12px", color: "var(--ghost)", fontSize: 10 }}>{i + 1}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text)", fontWeight: 500 }}>{row.coin}</td>
                    <td style={{ padding: "7px 12px", color: "var(--text-dim)", fontSize: 10 }}>{row.cat}</td>
                    {venueGroups.map((g, gi) =>
                      g.cols.map(([col], ci) => (
                        <td key={col} style={{
                          padding: "7px 10px", textAlign: "right",
                          color: aprColorFn(row[col]),
                          fontWeight: sortCol === col ? 600 : 400,
                          borderLeft: (gi > 0 && ci === 0) || ci === 0 ? "1px solid #0d1525" : "none",
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


function applyRollingMA(data, windows, freq) {
  return data.map((d, i) => {
    const pt = { time: d.time, raw: d.rate * freq };
    for (const w of windows) {
      if (i >= w.n - 1) {
        const avg = data.slice(i - w.n + 1, i + 1).reduce((s, x) => s + x.rate, 0) / w.n;
        pt[w.key] = avg * freq;
      } else {
        pt[w.key] = null;
      }
    }
    return pt;
  });
}

function TrendTooltip({ active, payload, wins, activeWins, mode }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
      <div style={{ color: "#4a9eff", marginBottom: 5, fontSize: 10 }}>{fmtDateTime(d.time)}</div>
      {d.raw != null && (
        <div style={{ color: "var(--text-label)", marginBottom: 4, fontSize: 10 }}>
          {mode === "daily" ? "Day avg" : "Raw rate"}{" "}
          <span style={{ color: d.raw >= 0 ? "#2a3a2a" : "#3a2a2a" }}>{fmtAPR(d.raw)}</span>
        </div>
      )}
      {wins.map((w, i) => activeWins.has(w.key) && d[w.key] != null && (
        <div key={w.key} style={{ marginBottom: 2 }}>
          <span style={{ color: MA_COLORS[i % MA_COLORS.length] }}>{w.label}</span>
          <span style={{ color: "#bbb" }}> {fmtAPR(d[w.key])}</span>
        </div>
      ))}
    </div>
  );
}

function TrendPage() {
  const isMobile = useIsMobile();
  const [category, setCategory] = usePersistedState("trendCategory", "Crypto");
  const [coin, setCoin]         = usePersistedState("trendCoin", "BTC");
  const [inputCoin, setInputCoin] = useState(() => {
    try { return JSON.parse(localStorage.getItem("trendCoin") ?? '"BTC"'); } catch { return "BTC"; }
  });
  const [venue, setVenue]       = usePersistedState("trendVenue", "hl");
  const [mode, setMode]         = usePersistedState("trendMode", "daily"); // "daily" | "intraday"
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [chartData, setChartData] = useState([]);
  const [activeWins, setActiveWins] = useState(new Set(["ma7", "ma30", "ma90"]));

  const wins = mode === "daily" ? DAILY_WINS : (INTRADAY_WINS[venue] ?? INTRADAY_WINS.bn);

  // Reset active MA windows when mode or venue changes
  useEffect(() => {
    if (mode === "daily") {
      setActiveWins(new Set(["ma7", "ma30", "ma90"]));
    } else {
      const w = INTRADAY_WINS[venue] ?? INTRADAY_WINS.bn;
      setActiveWins(new Set(w.slice(0, 2).map(x => x.key)));
    }
  }, [mode, venue]);

  const load = useCallback(async (c, v, m) => {
    if (CRYPTO_ONLY_VENUES.has(v) && isXyz(c)) {
      setError(`${c} is not available on ${VENUES.find(x => x.id === v)?.label}`);
      setChartData([]); return;
    }
    setLoading(true); setError(null); setChartData([]);
    try {
      // Fetch enough data to compute largest MA window
      const days = m === "daily" ? 92 : 32;   // +2 days buffer
      let raw = [];
      if      (v === "hl")  raw = await fetchAllFunding(c, days);
      else if (v === "bn")  raw = await fetchBinanceFundingHistory(c, days);
      else if (v === "by")  raw = await fetchBybitFundingHistory(c, days);
      else if (v === "okx") raw = await fetchOkxFundingHistory(c, days);
      else if (v === "dy")  raw = await fetchDydxFundingHistory(c, days);
      else if (v === "lt")  raw = await fetchLighterFundingHistory(c, days);
      else if (v === "ad")  raw = await fetchAsterdexFundingHistory(c, days);

      if (!raw.length) throw new Error(`No data for ${c} on ${VENUES.find(x => x.id === v)?.label}`);

      const freq = VENUE_FREQ[v];
      // Periods per day for each venue (used to convert day-windows to period-counts)
      const ppd = { hl: 24, dy: 24, lt: 24, bn: 3, by: 3, okx: 3, ad: 3 }[v] ?? 24;
      const winsToUse = m === "daily"
        ? DAILY_WINS.map(w => ({ ...w, n: w.n * ppd }))   // 7j → 7×24=168 HL periods, 7×3=21 BN periods…
        : (INTRADAY_WINS[v] ?? INTRADAY_WINS.bn);
      // Always use raw data points — gives same result as Explorer's simple mean at the last point
      const base = raw.map(d => ({ time: d.time, rate: parseFloat(d.fundingRate) }));

      setChartData(applyRollingMA(base, winsToUse, freq));
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(coin, venue, mode); }, [coin, venue, mode, load]);

  const toggleWin = (key) => setActiveWins(prev => {
    const next = new Set(prev);
    if (next.has(key)) { if (next.size > 1) next.delete(key); }
    else next.add(key);
    return next;
  });

  const handleCoinSelect = (c) => { setCoin(c); setInputCoin(c); };
  const handleVenueChange = (vid) => {
    setVenue(vid);
    if (vid !== "hl" && category !== "Crypto") {
      setCategory("Crypto");
      const available = getVenueCoins(vid, "Crypto");
      if (available.length > 0 && !available.includes(coin)) { setCoin(available[0]); setInputCoin(available[0]); }
    }
  };

  // Last non-null values for each MA
  const last = chartData.length ? chartData[chartData.length - 1] : null;
  const activeWinList = wins.filter(w => activeWins.has(w.key));
  const shortVal = last ? last[activeWinList[0]?.key] : null;
  const longVal  = last ? last[activeWinList[activeWinList.length - 1]?.key] : null;
  const signal   = shortVal != null && longVal != null && activeWinList.length > 1
    ? (shortVal > longVal ? "haussier" : shortVal < longVal ? "baissier" : "neutre")
    : null;

  const venueColor = VENUES.find(v2 => v2.id === venue)?.color ?? "#4a9eff";

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 600, color: "var(--text)", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
          {coin}<span style={{ color: venueColor }}>-TREND</span>
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {[["daily","DAILY MA"],["intraday","INTRADAY MA"]].map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              boxSizing: "border-box",
              background: mode === m ? "#4a9eff22" : "transparent",
              border: `1px solid ${mode === m ? "#4a9eff" : "var(--border)"}`,
              borderRadius: 4, color: mode === m ? "#4a9eff" : "#bbb",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: mode === m ? 600 : 400,
              padding: "6px 12px", cursor: "pointer", letterSpacing: "0.05em", whiteSpace: "nowrap",
            }}>{isMobile ? (m === "daily" ? "DAILY" : "INTRADAY") : lbl}</button>
          ))}
        </div>
      </div>

      {/* Venue selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4 }}>Venue</span>
        {VENUES.map(v2 => (
          <button key={v2.id} onClick={() => handleVenueChange(v2.id)} style={{
            boxSizing: "border-box",
            background: venue === v2.id ? `${v2.color}22` : "transparent",
            border: `1px solid ${venue === v2.id ? v2.color : "var(--border)"}`,
            borderRadius: 4, color: venue === v2.id ? v2.color : "#bbb",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: venue === v2.id ? 600 : 400,
            padding: "5px 12px", cursor: "pointer", letterSpacing: "0.05em",
          }}>{v2.label}</button>
        ))}
      </div>

      {/* Category + coin selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4 }}>Market</span>
        {Object.keys(MARKETS).map(cat => {
          const enabled = venue === "hl" || cat === "Crypto";
          return (
            <button key={cat} onClick={() => { if (!enabled) return; setCategory(cat); handleCoinSelect(MARKETS[cat][0]); }} style={{
              background: category === cat ? "#4a9eff" : "transparent",
              border: `1px solid ${category === cat ? "#4a9eff" : enabled ? "var(--border)" : "var(--border-dim)"}`,
              borderRadius: 4, color: category === cat ? "var(--bg)" : enabled ? "#bbb" : "#222",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: category === cat ? 600 : 400,
              padding: "5px 10px", cursor: enabled ? "pointer" : "not-allowed",
              letterSpacing: "0.05em", textTransform: "uppercase", opacity: enabled ? 1 : 0.3,
            }}>{cat}</button>
          );
        })}
      </div>
      {/* Asset row — coin selector only, search moved to stats row */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4, flexShrink: 0 }}>Asset</span>
        <CoinSelector coins={getVenueCoins(venue, category)} selected={coin} onSelect={handleCoinSelect} />
      </div>

      {/* Stats cards + window controls (mirrors Explorer layout) */}
      {last && activeWinList.length > 0 && (
        <div style={{ marginBottom: 12, width: "100%" }}>
          {/* Mobile: window toggles + search in compact top row */}
          {isMobile && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
              {wins.map((w, i) => {
                const color = MA_COLORS[i % MA_COLORS.length];
                const active = activeWins.has(w.key);
                return (
                  <button key={w.key} onClick={() => toggleWin(w.key)} style={{
                    boxSizing: "border-box",
                    background: active ? `${color}22` : "transparent",
                    border: `1px solid ${active ? color : "var(--border)"}`,
                    borderRadius: 4, color: active ? color : "#555",
                    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: active ? 600 : 400,
                    padding: "6px 10px", cursor: "pointer",
                  }}>{w.label}</button>
                );
              })}
              <div style={{ flex: 1 }} />
              <input value={inputCoin} onChange={e => setInputCoin(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleCoinSelect(inputCoin.trim().toUpperCase())}
                placeholder="Ticker..."
                style={{ width: 80, background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "6px 8px", outline: "none" }} />
              <button onClick={() => handleCoinSelect(inputCoin.trim().toUpperCase())} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "var(--bg)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>GO</button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, width: "100%" }}>
            {/* Left: MA stat cards */}
            <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
              {activeWinList.map((w, i) => {
                const color = MA_COLORS[i % MA_COLORS.length];
                const val = last[w.key];
                if (val == null) return null;
                return (
                  <StatCard key={w.key} label={w.label}
                    value={<span style={{ color: val >= 0 ? "#00d4aa" : "#ff4d6d" }}>{fmtAPR(val)}</span>}
                    sub={`rate: ${(val / VENUE_FREQ[venue]).toFixed(4)}%`}
                    color={color}
                  />
                );
              })}
            </div>
            {/* Right: window toggles + search (desktop only) */}
            {!isMobile && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {wins.map((w, i) => {
                    const color = MA_COLORS[i % MA_COLORS.length];
                    const active = activeWins.has(w.key);
                    return (
                      <button key={w.key} onClick={() => toggleWin(w.key)} style={{
                        boxSizing: "border-box",
                        background: active ? `${color}22` : "transparent",
                        border: `1px solid ${active ? color : "var(--border)"}`,
                        borderRadius: 4, color: active ? color : "#555",
                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: active ? 600 : 400,
                        padding: "5px 10px", cursor: "pointer",
                      }}>{w.label}</button>
                    );
                  })}
                </div>
                <div style={{ display: "flex" }}>
                  <input value={inputCoin} onChange={e => setInputCoin(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === "Enter" && handleCoinSelect(inputCoin.trim().toUpperCase())}
                    placeholder="Ticker..."
                    style={{ flex: 1, minWidth: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: "none", borderRadius: "6px 0 0 6px", color: "var(--text)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "5px 8px", outline: "none" }} />
                  <button onClick={() => handleCoinSelect(inputCoin.trim().toUpperCase())} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "var(--bg)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, padding: "5px 10px", cursor: "pointer" }}>GO</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ background: "var(--bg-alt)", border: "1px solid #0d1a2e", borderRadius: 8, padding: "12px 4px 4px 0", flex: 1, minHeight: 260 }}>
        {loading && (
          <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a9eff44", fontSize: 11, letterSpacing: "0.15em" }}>
            CALCUL DES MOYENNES…
          </div>
        )}
        {error && !loading && (
          <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4d6d", fontSize: 11 }}>
            ▲ {error}
          </div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 6" stroke="#0d1a2e" vertical={false} />
              <XAxis dataKey="time" type="number" domain={["dataMin","dataMax"]} scale="time"
                tickFormatter={fmtDateShort}
                tick={{ fill: "var(--border)", fontSize: 9, fontFamily: "'IBM Plex Mono'" }}
                axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v.toFixed(1) + "%"}
                tick={{ fill: "var(--border)", fontSize: 9, fontFamily: "'IBM Plex Mono'" }}
                axisLine={false} tickLine={false} width={46} />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="4 4" />
              <Tooltip content={<TrendTooltip wins={wins} activeWins={activeWins} mode={mode} />} />
              {/* Raw / daily avg as very faint area */}
              <Area dataKey="raw" stroke="#ffffff0a" fill="#ffffff06" dot={false} activeDot={false} isAnimationActive={false} />
              {/* MA lines */}
              {wins.map((w, i) => activeWins.has(w.key) && (
                <Line key={w.key} type="monotone" dataKey={w.key}
                  stroke={MA_COLORS[i % MA_COLORS.length]}
                  strokeWidth={1.5 + i * 0.4}
                  dot={false} activeDot={{ r: 3 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer info */}
      {chartData.length > 0 && !loading && (
        <div style={{ marginTop: 6, fontSize: 9, color: "#1e2a3a", textAlign: "right" }}>
          {mode === "daily"
            ? `${chartData.length} raw pts · windows in days × ${({ hl:24,dy:24,lt:24,bn:3,by:3,okx:3,ad:3 }[venue]??24)} periods/d`
            : `${chartData.length} raw pts · ${VENUES.find(v2 => v2.id === venue)?.label}`
          }
        </div>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();
  const [page, setPage] = usePersistedState("page", "explorer");
  const [explorerCoin, setExplorerCoin] = usePersistedState("explorerCoin", "BTC");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themeMode, setThemeMode] = usePersistedState("themeMode", "auto");
  // Incremented after dynamic asset fetch to trigger re-render across all pages
  const [, setAssetsVersion] = useState(0);

  const navigateToExplorer = (coin) => { setExplorerCoin(coin); setPage("explorer"); };

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

  const SIDEBAR_W = isMobile ? 0 : (sidebarOpen ? 200 : 52);

  const NAV_ITEMS = [
    { id: "explorer", icon: "◈", label: "Explorer" },
    { id: "trend",    icon: "⟲", label: "Trend" },
    { id: "compare",  icon: "⊞", label: "Compare" },
    { id: "arbi",     icon: "⇌", label: "Spread" },
  ];

  const navBtnStyle = (id) => ({
    display: "flex",
    alignItems: "center",
    gap: sidebarOpen ? 10 : 0,
    justifyContent: sidebarOpen ? "flex-start" : "center",
    width: "100%",
    padding: sidebarOpen ? "9px 14px" : "9px 0",
    background: page === id ? "#4a9eff22" : "transparent",
    border: "none",
    borderLeft: page === id ? "2px solid #4a9eff" : "2px solid transparent",
    borderRadius: 0,
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
        <div style={{
          width: SIDEBAR_W, minWidth: SIDEBAR_W, maxWidth: SIDEBAR_W,
          background: "var(--bg-card)", borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          transition: "width 0.18s ease, min-width 0.18s ease, max-width 0.18s ease",
          overflow: "hidden", position: "sticky", top: 0, height: "100vh", zIndex: 100,
        }}>
          <button style={toggleBtnStyle} onClick={() => setSidebarOpen(v => !v)}>☰</button>
          <nav style={{ flex: 1, display: "flex", flexDirection: "column", marginTop: 4 }}>
            {NAV_ITEMS.map(({ id, icon, label }) => (
              <button key={id} onClick={() => setPage(id)} style={navBtnStyle(id)}>
                <span style={{ fontSize: 14, flexShrink: 0, width: sidebarOpen ? "auto" : "100%", textAlign: "center" }}>{icon}</span>
                {sidebarOpen && <span>{label}</span>}
              </button>
            ))}
          </nav>
          {sidebarOpen && (
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)" }}>
              <button onClick={cycleTheme} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-muted)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, padding: "5px 8px", cursor: "pointer", textAlign: "left", letterSpacing: "0.05em" }}>
                {themeMode === "auto" ? "◑ auto" : themeMode === "dark" ? "● dark" : "☀ light"}
              </button>
              <div style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.08em" }}>v1.0</div>
              <div style={{ fontSize: 9, color: "var(--ghost)", letterSpacing: "0.05em" }}>built by psql</div>
            </div>
          )}
        </div>
      )}

      {/* Bottom nav bar — mobile only */}
      {isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, height: 56,
          background: "var(--bg-card)", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "stretch", zIndex: 200,
        }}>
          {NAV_ITEMS.map(({ id, icon, label }) => (
            <button key={id} onClick={() => setPage(id)} style={{
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
          <button onClick={cycleTheme} style={{
            width: 44, display: "flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", borderTop: "2px solid transparent",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 15, flexShrink: 0,
          }}>
            {themeMode === "auto" ? "◑" : themeMode === "dark" ? "●" : "☀"}
          </button>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "12px 14px" : "clamp(14px,3vw,28px) clamp(16px,4vw,32px)", paddingBottom: isMobile ? 68 : undefined }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          {page === "explorer"
            ? <ExplorerPage key={explorerCoin} initialCoin={explorerCoin} />
            : page === "trend"
            ? <TrendPage />
            : page === "compare"
            ? <ComparePage onNavigate={navigateToExplorer} />
            : <ArbitragePage onNavigate={navigateToExplorer} />
          }
        </div>
      </div>
    </div>
  );
}
