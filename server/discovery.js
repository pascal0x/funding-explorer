// Dynamic coin discovery per venue — refreshes periodically
const HL_BASE = "https://api.hyperliquid.xyz/info";

const XYZ = new Set([
  "NVDA","TSLA","AAPL","MSFT","META","AMZN","GOOGL","COIN","AMD","PLTR","NFLX",
  "MSTR","GME","INTC","GOLD","SILVER","NATGAS","BRENTOIL","COPPER","PLATINUM",
  "PALLADIUM","URANIUM","ALUMINIUM","EUR","JPY","DXY","EWJ","EWY","TSM","HOOD",
  "LLY","ORCL","MU","CRCL","BABA","RIVN","COST","XYZ100","CRWV","SKHX","SMSN",
  "SNDK","SOFTBANK","KIOXIA","USAR","URNM",
]);

// Cache: { venue: { coins: [...], updatedAt: ms } }
const cache = {};
const CACHE_TTL = 6 * 3600 * 1000; // 6 hours

async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function discoverHL() {
  // Main universe
  const meta = await fetchJson(HL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta" }),
  });
  const mainCoins = (meta?.universe ?? []).map(u => u.name);

  // XYZ universe (stocks, commodities, FX)
  const xyzData = await fetchJson(HL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs", dex: "xyz" }),
  });
  const xyzCoins = (xyzData?.[0]?.universe ?? []).map(u => u.name);

  return [...mainCoins, ...xyzCoins];
}

async function discoverBinance() {
  const data = await fetchJson("https://fapi.binance.com/fapi/v1/exchangeInfo");
  return (data?.symbols ?? [])
    .filter(s => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
    .map(s => {
      let name = s.baseAsset;
      if (name === "1000PEPE") name = "kPEPE";
      if (name === "1000SPX") name = "SPX";
      return name;
    });
}

async function discoverBybit() {
  const data = await fetchJson("https://api.bybit.com/v5/market/instruments-info?category=linear&settleCoin=USDT&limit=1000");
  return (data?.result?.list ?? []).map(s => {
    let name = s.baseCoin;
    if (name === "1000PEPE") name = "kPEPE";
    if (name === "1000SPX") name = "SPX";
    return name;
  });
}

async function discoverOKX() {
  const data = await fetchJson("https://www.okx.com/api/v5/public/instruments?instType=SWAP");
  return (data?.data ?? [])
    .filter(s => s.settleCcy === "USDT")
    .map(s => {
      let name = s.ctValCcy;
      if (name === "1000PEPE") name = "kPEPE";
      if (name === "1000SPX") name = "SPX";
      return name;
    });
}

async function discoverDydx() {
  const data = await fetchJson("https://indexer.dydx.trade/v4/perpetualMarkets");
  return Object.keys(data?.markets ?? {}).map(t => t.replace(/-USD$/, ""));
}

async function discoverLighter() {
  const data = await fetchJson("https://mainnet.zklighter.elliot.ai/api/v1/orderbooks");
  return (data?.orderbooks ?? []).map(m =>
    (m.symbol ?? "").replace(/_USDC$/, "").replace(/_USDT$/, "")
  ).filter(Boolean);
}

async function discoverAsterdex() {
  const data = await fetchJson("https://fapi.asterdex.com/fapi/v1/exchangeInfo");
  return (data?.symbols ?? [])
    .filter(s => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING")
    .map(s => {
      let name = s.baseAsset;
      if (name === "1000PEPE") name = "kPEPE";
      return name;
    });
}

const DISCOVERERS = {
  hl: discoverHL,
  bn: discoverBinance,
  by: discoverBybit,
  okx: discoverOKX,
  dy: discoverDydx,
  lt: discoverLighter,
  ad: discoverAsterdex,
};

export async function getCoinsForVenue(venue) {
  const cached = cache[venue];
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL) {
    return cached.coins;
  }
  const discoverer = DISCOVERERS[venue];
  if (!discoverer) return [];
  try {
    const coins = await discoverer();
    cache[venue] = { coins, updatedAt: Date.now() };
    console.log(`[discovery] ${venue}: ${coins.length} coins`);
    return coins;
  } catch (e) {
    console.error(`[discovery] ${venue} error:`, e.message);
    return cached?.coins ?? [];
  }
}

export { XYZ };
