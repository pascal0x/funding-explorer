// Scheduler: fetch all venues incrementally and store in DB
import cron from "node-cron";
import { fetchVenue } from "./fetchers.js";
import { insertRates, getLastTime } from "./db.js";
import { getCoinsForVenue } from "./discovery.js";

// Cron schedules per venue (HL/Lighter hourly, CEXs every 8h with offsets)
const VENUE_SCHEDULES = {
  hl:  "0 * * * *",
  bn:  "10 0,8,16 * * *",
  by:  "20 0,8,16 * * *",
  okx: "30 0,8,16 * * *",
  dy:  "0 1,9,17 * * *",
  lt:  "5 * * * *",
  ad:  "40 0,8,16 * * *",
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
  const coins = await getCoinsForVenue(venue);
  if (!coins.length) {
    console.warn(`[scheduler] ${venue}: no coins discovered, skipping`);
    return;
  }
  console.log(`[scheduler] syncing ${venue} (${coins.length} coins)…`);
  for (const coin of coins) {
    await syncVenueCoin(venue, coin);
    await new Promise(r => setTimeout(r, 200));
  }
}

export function startScheduler() {
  for (const [venue, freq] of Object.entries(VENUE_SCHEDULES)) {
    cron.schedule(freq, () => syncVenue(venue));
  }
  console.log("[scheduler] cron jobs registered");
}

// Initial backfill: run all venues on startup to fill the DB
export async function initialBackfill() {
  console.log("[scheduler] starting initial backfill…");
  for (const venue of Object.keys(VENUE_SCHEDULES)) {
    await syncVenue(venue);
  }
  console.log("[scheduler] initial backfill complete");
}
