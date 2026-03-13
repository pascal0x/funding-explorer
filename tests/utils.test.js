import { describe, it, expect } from "vitest";
import {
  apiCoin, isXyz, toAPR, fmtRate, fmtAPR, getCat,
  bnSym, bySym, adSym, okxSym, aprColor, venueAvgAPR,
  prioritizeCoins, extractCoinCollateral,
  MARKETS, XYZ, VENUE_FREQ,
} from "../src/utils.js";

// ── apiCoin / isXyz ───────────────────────────────────────────────────────────
describe("apiCoin", () => {
  it("prefixes XYZ assets with xyz:", () => {
    expect(apiCoin("NVDA")).toBe("xyz:NVDA");
    expect(apiCoin("GOLD")).toBe("xyz:GOLD");
    expect(apiCoin("EUR")).toBe("xyz:EUR");
  });

  it("returns crypto coins as-is", () => {
    expect(apiCoin("BTC")).toBe("BTC");
    expect(apiCoin("ETH")).toBe("ETH");
    expect(apiCoin("SOL")).toBe("SOL");
  });
});

describe("isXyz", () => {
  it("returns true for XYZ assets", () => {
    expect(isXyz("NVDA")).toBe(true);
    expect(isXyz("TSLA")).toBe(true);
  });

  it("returns false for crypto", () => {
    expect(isXyz("BTC")).toBe(false);
    expect(isXyz("HYPE")).toBe(false);
  });
});

// ── APR calculations ──────────────────────────────────────────────────────────
describe("toAPR", () => {
  it("converts hourly rate to annualized % (default freq: 24*365)", () => {
    // 0.01% hourly = 0.0001 * 100 * 8760 = 87.6%
    expect(toAPR("0.0001")).toBeCloseTo(87.6, 1);
  });

  it("uses custom frequency for 8h venues", () => {
    // 0.01% per 8h = 0.0001 * 100 * 1095 = 10.95%
    expect(toAPR("0.0001", 3 * 365)).toBeCloseTo(10.95, 1);
  });

  it("handles negative rates", () => {
    expect(toAPR("-0.0001")).toBeCloseTo(-87.6, 1);
  });

  it("handles zero", () => {
    expect(toAPR("0")).toBe(0);
  });
});

// ── Formatting ────────────────────────────────────────────────────────────────
describe("fmtRate", () => {
  it("formats funding rate as percentage with 4 decimals", () => {
    expect(fmtRate("0.0001")).toBe("0.0100%");
    expect(fmtRate("-0.00025")).toBe("-0.0250%");
    expect(fmtRate("0")).toBe("0.0000%");
  });
});

describe("fmtAPR", () => {
  it("formats positive APR with + sign", () => {
    expect(fmtAPR(12.345)).toBe("+12.35%");
  });

  it("formats negative APR without + sign", () => {
    expect(fmtAPR(-5.678)).toBe("-5.68%");
  });

  it("formats zero as positive", () => {
    expect(fmtAPR(0)).toBe("+0.00%");
  });
});

// ── Category detection ────────────────────────────────────────────────────────
describe("getCat", () => {
  it("classifies crypto coins", () => {
    expect(getCat("BTC")).toBe("Crypto");
    expect(getCat("ETH")).toBe("Crypto");
    expect(getCat("HYPE")).toBe("Crypto");
  });

  it("classifies stocks", () => {
    expect(getCat("NVDA")).toBe("Stocks");
    expect(getCat("TSLA")).toBe("Stocks");
    expect(getCat("GOOGL")).toBe("Stocks");
  });

  it("classifies commodities", () => {
    expect(getCat("GOLD")).toBe("Commodities");
    expect(getCat("SILVER")).toBe("Commodities");
    expect(getCat("NATGAS")).toBe("Commodities");
  });

  it("classifies FX / ETF", () => {
    expect(getCat("EUR")).toBe("FX / ETF");
    expect(getCat("DXY")).toBe("FX / ETF");
  });

  it("classifies Asterdex-specific names", () => {
    expect(getCat("XAU")).toBe("Commodities");  // AD gold
    expect(getCat("XAG")).toBe("Commodities");  // AD silver
    expect(getCat("GOOG")).toBe("Stocks");       // AD google (not GOOGL)
    expect(getCat("XNY")).toBe("FX / ETF");      // AD only
  });

  it("returns Other for unknown coins", () => {
    expect(getCat("UNKNOWN123")).toBe("Other");
  });
});

// ── Symbol formatters ─────────────────────────────────────────────────────────
describe("bnSym / bySym / adSym", () => {
  it("appends USDT to standard coins", () => {
    expect(bnSym("BTC")).toBe("BTCUSDT");
    expect(bySym("ETH")).toBe("ETHUSDT");
    expect(adSym("SOL")).toBe("SOLUSDT");
  });

  it("converts PEPE/kPEPE to 1000PEPE", () => {
    expect(bnSym("PEPE")).toBe("1000PEPEUSDT");
    expect(bnSym("kPEPE")).toBe("1000PEPEUSDT");
    expect(bySym("kPEPE")).toBe("1000PEPEUSDT");
  });
});

describe("okxSym", () => {
  it("formats OKX swap symbol", () => {
    expect(okxSym("BTC")).toBe("BTC-USDT-SWAP");
    expect(okxSym("ETH")).toBe("ETH-USDT-SWAP");
  });

  it("handles PEPE override", () => {
    expect(okxSym("kPEPE")).toBe("1000PEPE-USDT-SWAP");
  });
});

// ── aprColor ──────────────────────────────────────────────────────────────────
describe("aprColor", () => {
  it("returns green for positive", () => {
    expect(aprColor(5.5)).toBe("#00d4aa");
  });

  it("returns red for negative", () => {
    expect(aprColor(-3.2)).toBe("#ff4d6d");
  });

  it("returns dim for null/undefined", () => {
    expect(aprColor(null)).toBe("var(--text-dim)");
    expect(aprColor(undefined)).toBe("var(--text-dim)");
  });

  it("returns green for zero", () => {
    expect(aprColor(0)).toBe("#00d4aa");
  });
});

// ── venueAvgAPR ───────────────────────────────────────────────────────────────
describe("venueAvgAPR", () => {
  it("computes avg APR from funding data for HL (hourly)", () => {
    const data = [
      { fundingRate: "0.0001" },
      { fundingRate: "0.0002" },
      { fundingRate: "0.0003" },
    ];
    // avg = 0.0002, APR = 0.0002 * 100 * 8760 = 175.2
    expect(venueAvgAPR(data, "hl")).toBeCloseTo(175.2, 1);
  });

  it("computes avg APR for Binance (8h)", () => {
    const data = [
      { fundingRate: "0.0001" },
      { fundingRate: "0.0003" },
    ];
    // avg = 0.0002, APR = 0.0002 * 100 * 1095 = 21.9
    expect(venueAvgAPR(data, "bn")).toBeCloseTo(21.9, 1);
  });

  it("returns null for empty data", () => {
    expect(venueAvgAPR([], "hl")).toBeNull();
    expect(venueAvgAPR(null, "hl")).toBeNull();
  });
});

// ── prioritizeCoins ───────────────────────────────────────────────────────────
describe("prioritizeCoins", () => {
  it("puts BTC/ETH/SOL/BNB/LINK first for crypto", () => {
    const coins = ["ARB", "BTC", "LINK", "SOL", "ETH", "HYPE", "BNB"];
    const result = prioritizeCoins("hl", "Crypto", coins);
    expect(result.slice(0, 4)).toEqual(["BTC", "ETH", "SOL", "BNB"]);
    expect(result[4]).toBe("LINK");
  });

  it("adds venue-specific popular coins after top 5", () => {
    const coins = ["BTC", "ETH", "SOL", "BNB", "LINK", "HYPE", "SUI", "ARB"];
    const result = prioritizeCoins("hl", "Crypto", coins);
    // HYPE and SUI are in HL popular list
    expect(result.indexOf("HYPE")).toBeLessThan(result.indexOf("ARB"));
    expect(result.indexOf("SUI")).toBeLessThan(result.indexOf("ARB"));
  });

  it("returns unchanged for non-crypto categories", () => {
    const coins = ["NVDA", "TSLA", "AAPL"];
    expect(prioritizeCoins("hl", "Stocks", coins)).toEqual(coins);
  });
});

// ── extractCoinCollateral ─────────────────────────────────────────────────────
describe("extractCoinCollateral", () => {
  it("extracts USDT collateral", () => {
    expect(extractCoinCollateral("BTCUSDT")).toEqual({ coin: "BTC", collateral: "USDT" });
  });

  it("extracts USDC collateral", () => {
    expect(extractCoinCollateral("ETHUSDC")).toEqual({ coin: "ETH", collateral: "USDC" });
  });

  it("extracts BTC collateral", () => {
    expect(extractCoinCollateral("ETHBTC")).toEqual({ coin: "ETH", collateral: "BTC" });
  });

  it("returns null collateral for unrecognized format", () => {
    expect(extractCoinCollateral("RANDOM")).toEqual({ coin: "RANDOM", collateral: null });
  });

  it("handles empty string", () => {
    expect(extractCoinCollateral("")).toEqual({ coin: "", collateral: null });
  });

  it("does not match if coin part would be empty", () => {
    expect(extractCoinCollateral("USDT")).toEqual({ coin: "USDT", collateral: null });
  });
});

// ── Data integrity ────────────────────────────────────────────────────────────
describe("data integrity", () => {
  it("all XYZ assets have a category (track uncategorized)", () => {
    // These XYZ coins are not yet in MARKETS or AD_ lists — they work via
    // dynamic discovery but have no static category. Track them here.
    const KNOWN_UNCATEGORIZED = new Set([
      "CRCL", "BABA", "RIVN", "COST", "XYZ100", "CRWV", "SKHX",
      "SMSN", "SNDK", "SOFTBANK", "KIOXIA", "USAR", "URNM",
    ]);
    const unexpected = [];
    for (const coin of XYZ) {
      const cat = getCat(coin);
      if (cat === "Other" && !KNOWN_UNCATEGORIZED.has(coin)) {
        unexpected.push(coin);
      }
    }
    expect(unexpected, `Unexpected uncategorized XYZ coins: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("VENUE_FREQ covers all known venue IDs", () => {
    const expected = ["hl", "bn", "by", "okx", "dy", "lt", "ad"];
    for (const id of expected) {
      expect(VENUE_FREQ[id], `VENUE_FREQ missing ${id}`).toBeDefined();
    }
  });

  it("MARKETS categories are non-empty", () => {
    for (const [cat, list] of Object.entries(MARKETS)) {
      expect(list.length, `${cat} should have coins`).toBeGreaterThan(0);
    }
  });

  it("no duplicate coins within a MARKETS category", () => {
    for (const [cat, list] of Object.entries(MARKETS)) {
      const set = new Set(list);
      expect(set.size, `${cat} has duplicates`).toBe(list.length);
    }
  });
});
