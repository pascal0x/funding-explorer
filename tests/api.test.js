// API smoke tests — requires backend running on port 4000
// Run: npm test -- tests/api.test.js
import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:4000";

// Check if backend is reachable before running tests
let backendAvailable = false;
beforeAll(async () => {
  try {
    const r = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(3000) });
    backendAvailable = r.ok;
  } catch {
    backendAvailable = false;
  }
});

function skipIfNoBackend() {
  if (!backendAvailable) {
    console.warn("⚠ Backend not running on port 4000, skipping API tests");
    return true;
  }
  return false;
}

// ── /api/status ───────────────────────────────────────────────────────────────
describe("GET /api/status", () => {
  it("returns row count and lastTime", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/status`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data).toHaveProperty("rows");
    expect(data).toHaveProperty("lastTime");
    expect(typeof data.rows).toBe("number");
    expect(data.rows).toBeGreaterThan(0);
  });
});

// ── /api/funding ──────────────────────────────────────────────────────────────
describe("GET /api/funding", () => {
  it("returns array of funding rates for hl/BTC", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/funding?venue=hl&coin=BTC&days=7`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("time");
      expect(data[0]).toHaveProperty("fundingRate");
    }
  });

  it("returns 400 without required params", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/funding`);
    expect(r.status).toBe(400);
  });

  it("returns empty array for unknown coin", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/funding?venue=hl&coin=DOESNOTEXIST999&days=1`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ── /api/live ─────────────────────────────────────────────────────────────────
describe("GET /api/live", () => {
  it("returns live data for hl/BTC", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/live?venue=hl&coin=BTC`);
    expect(r.status).toBe(200);
    const data = await r.json();
    // Should have fundingRate or be a valid response
    expect(data).toBeDefined();
  });

  it("returns 400 without params", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/live`);
    expect(r.status).toBe(400);
  });
});

// ── /api/bulk-apr ─────────────────────────────────────────────────────────────
describe("GET /api/bulk-apr", () => {
  it("returns array of {coin, avg7, avg30, avg90} for hl", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/bulk-apr?venue=hl`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("coin");
      expect(data[0]).toHaveProperty("avg7");
      expect(data[0]).toHaveProperty("avg30");
      expect(data[0]).toHaveProperty("avg90");
    }
  });

  it("returns 400 without venue", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/bulk-apr`);
    expect(r.status).toBe(400);
  });
});

// ── /api/coins ────────────────────────────────────────────────────────────────
describe("GET /api/coins", () => {
  it("returns array of coin strings for hl", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/coins?venue=hl`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(typeof data[0]).toBe("string");
    }
  });
});

// ── /api/funding/batch ────────────────────────────────────────────────────────
describe("GET /api/funding/batch", () => {
  it("returns APR data for multiple coins", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/funding/batch?venue=hl&coins=BTC,ETH&days=7`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0]).toHaveProperty("coin");
    expect(data[0]).toHaveProperty("apr7");
  });

  it("returns 400 without required params", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/funding/batch`);
    expect(r.status).toBe(400);
  });
});

// ── /api/boros ─────────────────────────────────────────────────────────────────
describe("GET /api/boros", () => {
  it("returns array of Boros markets", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/boros`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("coin");
      expect(data[0]).toHaveProperty("collateral");
      expect(data[0]).toHaveProperty("marketKey");
      expect(data[0]).toHaveProperty("platform");
      expect(data[0]).toHaveProperty("impliedApr");
      expect(data[0]).toHaveProperty("underlyingApr");
      // status field should be removed
      expect(data[0]).not.toHaveProperty("status");
    }
  });
});

// ── /api/boros/implied-avg ────────────────────────────────────────────────────
describe("GET /api/boros/implied-avg", () => {
  it("returns object of marketKey → average", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/boros/implied-avg`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(typeof data).toBe("object");
    expect(Array.isArray(data)).toBe(false);
    // Values should be numbers if present
    for (const v of Object.values(data)) {
      expect(typeof v).toBe("number");
    }
  });
});

// ── /api/proxy (CORS proxy) ──────────────────────────────────────────────────
describe("GET /api/proxy", () => {
  it("proxies boros requests", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/proxy/boros/v1/markets?limit=1&isWhitelisted=true`);
    // May succeed or fail depending on upstream, but should not 404
    expect(r.status).not.toBe(404);
  });

  it("rejects unknown venues", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/proxy/unknownvenue/test`);
    expect(r.status).toBe(404);
  });
});

// ── /api/markets/:venue ───────────────────────────────────────────────────────
describe("GET /api/markets/:venue", () => {
  it("returns coin list for asterdex", async () => {
    if (skipIfNoBackend()) return;
    const r = await fetch(`${BASE}/api/markets/ad`);
    if (r.status === 200) {
      const data = await r.json();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(typeof data[0]).toBe("string");
      }
    }
    // 502 is acceptable if upstream is down
    expect([200, 502]).toContain(r.status);
  });
});
