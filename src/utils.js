// Extracted utility functions for testing and reuse

// ── Market categories ─────────────────────────────────────────────────────────
export const MARKETS = {
  "Crypto":      ["HYPE","BTC","ETH","SOL","AVAX","ARB","OP","MATIC","DYDX","BNB","WIF","LINK","SUI","APT","SPX","kPEPE"],
  "Stocks":      ["NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","COIN","AMD","PLTR","NFLX","MSTR","GME","INTC","TSM","HOOD","LLY","ORCL","MU"],
  "Commodities": ["GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM","PALLADIUM","URANIUM","ALUMINIUM"],
  "FX / ETF":    ["EUR","JPY","DXY","EWJ","EWY"],
};

export const AD_STOCKS = ["AAPL","AMZN","GOOG","META","MSFT","NVDA","TSLA","INTC","HOOD","MU"];
export const AD_COMMODITIES = ["XAU","XAG","XCU","XPD","XPT","NATGAS","CL"];
export const AD_FX = ["SPX","QQQ","EWY","XNY"];

export const XYZ = new Set([
  "NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","COIN","AMD","PLTR","NFLX",
  "MSTR","GME","INTC","GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM",
  "PALLADIUM","URANIUM","ALUMINIUM","EUR","JPY","DXY","EWJ","EWY","TSM","HOOD",
  "LLY","ORCL","MU","CRCL","BABA","RIVN","COST","XYZ100","CRWV","SKHX","SMSN",
  "SNDK","SOFTBANK","KIOXIA","USAR","URNM",
]);

export const VENUE_FREQ = { hl: 24 * 365, bn: 3 * 365, by: 3 * 365, okx: 3 * 365, dy: 24 * 365, lt: 24 * 365, ad: 3 * 365 };

// ── Pure utility functions ────────────────────────────────────────────────────
export function apiCoin(c) { return XYZ.has(c) ? `xyz:${c}` : c; }
export function isXyz(c) { return XYZ.has(c); }
export function toAPR(r, freq = 24 * 365) { return parseFloat(r) * 100 * freq; }
export function fmtRate(r) { return (parseFloat(r) * 100).toFixed(4) + "%"; }
export function fmtAPR(v) { return (v >= 0 ? "+" : "") + v.toFixed(2) + "%"; }

export function getCat(coin) {
  for (const [cat, list] of Object.entries(MARKETS)) if (list.includes(coin)) return cat;
  if (AD_STOCKS.includes(coin)) return "Stocks";
  if (AD_COMMODITIES.includes(coin)) return "Commodities";
  if (AD_FX.includes(coin)) return "FX / ETF";
  return "Other";
}

// Symbol formatters for exchanges
const BN_SYMBOL = { "PEPE": "1000PEPE", "kPEPE": "1000PEPE", "SHIB": "1000SHIB", "FLOKI": "1000FLOKI" };
export function bnSym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
export function bySym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
export function adSym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
const OKX_SYMBOL = { "kPEPE": "1000PEPE", "PEPE": "1000PEPE", "SHIB": "1000SHIB" };
export function okxSym(c) { return (OKX_SYMBOL[c] ?? c) + "-USDT-SWAP"; }

// APR color helper
export function aprColor(v) {
  if (v === null || v === undefined) return "var(--text-dim)";
  return v >= 0 ? "#00d4aa" : "#ff4d6d";
}

// Venue average APR calculation
export function venueAvgAPR(data, vid) {
  if (!data?.length) return null;
  const freq = VENUE_FREQ[vid] ?? 24 * 365;
  const sum = data.reduce((s, d) => s + parseFloat(d.fundingRate), 0);
  return (sum / data.length) * 100 * freq;
}

// Coin prioritization for display
export const TOP5_STATIC = ["BTC", "ETH", "SOL", "BNB", "LINK"];
export const VENUE_POPULAR = {
  hl:  ["HYPE", "SUI", "AVAX", "WIF", "kPEPE"],
  bn:  ["kPEPE", "WIF", "SUI", "AVAX", "ARB"],
  by:  ["kPEPE", "WIF", "SUI", "AVAX", "ARB"],
  okx: ["SUI", "AVAX", "APT", "ARB", "WIF"],
  dy:  ["AVAX", "ARB", "OP", "DYDX", "SUI"],
  lt:  ["SUI", "AVAX", "ARB", "APT", "OP"],
  ad:  ["kPEPE", "WIF", "SUI", "AVAX", "ARB"],
};

export function prioritizeCoins(venue, category, coins) {
  if (category !== "Crypto") return coins;
  const set = new Set(coins);
  const top5 = TOP5_STATIC.filter(c => set.has(c));
  const top5Set = new Set(top5);
  const next5 = (VENUE_POPULAR[venue] ?? []).filter(c => set.has(c) && !top5Set.has(c));
  const next5Set = new Set(next5);
  const rest = coins.filter(c => !top5Set.has(c) && !next5Set.has(c));
  return [...top5, ...next5, ...rest];
}

// Collateral extraction (shared with server)
const COLLATERALS = ["USDT", "USDC", "USD", "BTC", "ETH", "SOL", "USDE", "DAI"];
export function extractCoinCollateral(raw) {
  for (const col of COLLATERALS) {
    if (raw.endsWith(col) && raw.length > col.length) {
      return { coin: raw.slice(0, -col.length), collateral: col };
    }
  }
  return { coin: raw, collateral: null };
}
