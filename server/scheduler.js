// Scheduler: fetch all venues incrementally and store in DB
import cron from "node-cron";
import { fetchVenue } from "./fetchers.js";
import { insertRates, getLastTime } from "./db.js";

const VENUES = {
  hl:  { freq: "0 * * * *",      coins: ["HYPE","BTC","ETH","SOL","AVAX","ARB","OP","MATIC","DYDX","BNB","WIF","LINK","SUI","APT","SPX","kPEPE"] },
  bn:  { freq: "10 0,8,16 * * *", coins: ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF","HYPE","PEPE","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP"] },
  by:  { freq: "20 0,8,16 * * *", coins: ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF","HYPE","PEPE","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP"] },
  okx: { freq: "30 0,8,16 * * *", coins: ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF","HYPE","PEPE","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP"] },
  dy:  { freq: "0 1,9,17 * * *",  coins: ["BTC","ETH","SOL","AVAX","LINK","ARB","OP","DOGE","ADA","XRP","LTC","MATIC","UNI","AAVE","CRV","JUP","WIF","PEPE","SUI","APT","BNB"] },
  lt:  { freq: "5 * * * *",       coins: ["BTC","ETH","SOL","AVAX","ARB","WIF","SUI","APT","LINK","BNB","HYPE"] },
  ad:  { freq: "40 0,8,16 * * *", coins: ["BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","WIF","PEPE","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","JUP"] },
};

async function syncVenueCoin(venue, coin) {
  try {
    const lastTime = await getLastTime(venue, coin);
    // If we have data, fetch only since last entry; otherwise fetch 90 days
    const days = lastTime
      ? Math.ceil((Date.now() - lastTime) / (24 * 3600 * 1000)) + 1
      : 90;

    const data = await fetchVenue(venue, coin, Math.min(days, 91));
    if (!data.length) return;

    // Only insert data newer than what we have
    const newData = lastTime ? data.filter(d => d.time > lastTime) : data;
    if (!newData.length) return;

    const rows = newData.map(d => ({ venue, coin, time: d.time, rate: d.fundingRate }));
    await insertRates(rows);
    console.log(`[sync] ${venue}/${coin}: +${rows.length} rows`);
  } catch (e) {
    console.error(`[sync] ${venue}/${coin} error:`, e.message);
  }
}

async function syncVenue(venue) {
  const coins = VENUES[venue].coins;
  console.log(`[scheduler] syncing ${venue} (${coins.length} coins)…`);
  // Sequential with small delay to avoid rate limiting
  for (const coin of coins) {
    await syncVenueCoin(venue, coin);
    await new Promise(r => setTimeout(r, 200));
  }
}

export function startScheduler() {
  for (const [venue, cfg] of Object.entries(VENUES)) {
    cron.schedule(cfg.freq, () => syncVenue(venue));
  }
  console.log("[scheduler] cron jobs registered");
}

// Initial backfill: run all venues on startup to fill the DB
export async function initialBackfill() {
  console.log("[scheduler] starting initial backfill…");
  for (const venue of Object.keys(VENUES)) {
    await syncVenue(venue);
  }
  console.log("[scheduler] initial backfill complete");
}
