import { useState, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from "recharts";

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

// Show first N coins as buttons, rest in dropdown
const VISIBLE_COUNT = 6;
const ALL_ASSETS = [...new Set([
  ...MARKETS["Crypto"], ...MARKETS["Stocks"],
  ...MARKETS["Commodities"], ...MARKETS["FX / ETF"],
])];

function apiCoin(c) { return XYZ.has(c) ? `xyz:${c}` : c; }
function isXyz(c) { return XYZ.has(c); }
function toAPR(r) { return parseFloat(r) * 100 * 24 * 365; }
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

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchAllFunding(coin, days) {
  const startTime = Date.now() - days * 24 * 3600 * 1000;
  const allData = [];
  let cursor = startTime;
  for (let i = 0; i < 30; i++) {
    const res = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fundingHistory", coin: apiCoin(coin), startTime: cursor }),
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

async function fetchLiveFunding(coin) {
  const dex = isXyz(coin) ? "xyz" : undefined;
  const body = dex ? { type: "metaAndAssetCtxs", dex } : { type: "metaAndAssetCtxs" };
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const universe = data[0].universe;
  const ctxs = data[1];
  const target = isXyz(coin) ? `xyz:${coin}` : coin;
  const idx = universe.findIndex(a => a.name === target);
  return idx !== -1 ? ctxs[idx] : null;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color, live }) => (
  <div style={{ background: "#0a0a18", border: `1px solid ${live ? "#4a9eff44" : "#1e3a5f"}`, borderRadius: 8, padding: "11px 13px" }}>
    <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
      {label}
      {live !== undefined && <span style={{ width: 5, height: 5, borderRadius: "50%", background: live ? "#00d4aa" : "#2a2a3a", display: "inline-block" }} />}
    </div>
    <div style={{ fontSize: 14, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>{sub}</div>}
  </div>
);

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const p = d.rate >= 0;
  return (
    <div style={{ background: "#07070f", border: `1px solid ${p ? "#00d4aa55" : "#ff4d6d55"}`, borderRadius: 8, padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
      <div style={{ color: "#4a9eff", marginBottom: 5, fontSize: 10 }}>{fmtDateTime(d.time)}</div>
      <div style={{ marginBottom: 2 }}>Rate <span style={{ color: p ? "#00d4aa" : "#ff4d6d", fontWeight: 600 }}>{fmtRate(d.rawRate)}</span></div>
      <div style={{ color: "#666", marginBottom: 2 }}>Premium <span style={{ color: "#888" }}>{(parseFloat(d.rawPremium) * 100).toFixed(4)}%</span></div>
      <div style={{ color: "#666" }}>APR <span style={{ color: p ? "#00d4aa" : "#ff4d6d", fontWeight: 600 }}>{fmtAPR(d.apr)}</span></div>
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
          border: `1px solid ${selected === c ? "#4a9eff" : "#1e3a5f"}`,
          borderRadius: 4,
          color: selected === c ? "#4a9eff" : "#555",
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          padding: "5px 8px",
          cursor: "pointer",
          lineHeight: 1,
        }}>{c}</button>
      ))}

      {rest.length > 0 && (
        <div ref={ref} style={{ position: "relative" }}>
          {/* Trigger button */}
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              boxSizing: "border-box",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: restSelected ? "#4a9eff22" : "transparent",
              border: `1px solid ${restSelected ? "#4a9eff" : open ? "#4a9eff55" : "#1e3a5f"}`,
              borderRadius: 4,
              color: restSelected ? "#4a9eff" : "#555",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              padding: "5px 7px 5px 9px",
              cursor: "pointer",
              lineHeight: 1,
              minWidth: 80,
            }}
          >
            <span style={{ flex: 1 }}>{restSelected ? selected : `+${rest.length}`}</span>
            <span style={{
              display: "inline-block",
              width: 0, height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: `5px solid ${restSelected ? "#4a9eff" : "#555"}`,
              transition: "transform 0.15s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0,
              marginTop: open ? -2 : 2,
            }} />
          </button>

          {/* Panel */}
          {open && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 5px)",
              left: 0,
              zIndex: 500,
              background: "#0f0f20",
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
                      color: selected === c ? "#4a9eff" : "#888",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      padding: "8px 14px",
                      cursor: "pointer",
                      textAlign: "left",
                      lineHeight: 1,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#1e1e35"; e.currentTarget.style.color = "#ddd"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = selected === c ? "#4a9eff18" : "transparent"; e.currentTarget.style.color = selected === c ? "#4a9eff" : "#888"; }}
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
function ExplorerPage({ initialCoin = "HYPE" }) {
  const initCat = () => { for (const [c, l] of Object.entries(MARKETS)) if (l.includes(initialCoin)) return c; return "Crypto"; };
  const [category, setCategory] = useState(initCat);
  const [coin, setCoin] = useState(initialCoin);
  const [inputCoin, setInputCoin] = useState(initialCoin);
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

  const loadLive = useCallback(async (c) => {
    try { setLive(await fetchLiveFunding(c)); } catch { setLive(null); }
  }, []);

  const fetchData = useCallback(async (c, days) => {
    setLoading(true); setLoadingMsg(days > 7 ? `Pagination (${days}j)...` : "Chargement...");
    setError(null); setData([]); setStats(null); setLive(null);
    try {
      const raw = await fetchAllFunding(c, days);
      if (!raw.length) throw new Error(`Aucune donnée pour ${c}`);
      const parsed = raw.map(d => ({
        time: d.time, rate: parseFloat(d.fundingRate) * 100,
        rawRate: d.fundingRate, rawPremium: d.premium, apr: toAPR(d.fundingRate),
        ratePos: parseFloat(d.fundingRate) >= 0 ? parseFloat(d.fundingRate) * 100 : 0,
        rateNeg: parseFloat(d.fundingRate) < 0 ? parseFloat(d.fundingRate) * 100 : 0,
      }));
      setData(parsed);
      const rates = parsed.map(d => d.rate);
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
      const positive = rates.filter(r => r >= 0).length;
      setStats({ avg, avgApr: avg * 24 * 365, max: Math.max(...rates), maxApr: Math.max(...rates) * 24 * 365, min: Math.min(...rates), minApr: Math.min(...rates) * 24 * 365, positive: ((positive / rates.length) * 100).toFixed(0), count: rates.length });
      loadLive(c);
    } catch (e) { setError(e.message); }
    setLoading(false); setLoadingMsg("");
  }, [loadLive]);

  useEffect(() => {
    fetchData(coin, period);
    if (liveRef.current) clearInterval(liveRef.current);
    liveRef.current = setInterval(() => loadLive(coin), 60000);
    return () => clearInterval(liveRef.current);
  }, [coin, period, fetchData, loadLive]);

  const handleCoinSelect = (c) => { setCoin(c); setInputCoin(c); setTablePage(0); };
  const handleSearch = () => { const c = inputCoin.trim().toUpperCase(); if (c) { setCoin(c); setTablePage(0); } };

  const tableData = [...data].reverse();
  const totalPages = Math.ceil(tableData.length / TABLE_SIZE);
  const pageData = tableData.slice(tablePage * TABLE_SIZE, (tablePage + 1) * TABLE_SIZE);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      {/* Title + period */}
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "clamp(18px,4vw,26px)", fontWeight: 600, color: "#fff", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
            {coin}<span style={{ color: "#4a9eff" }}>-PERP</span>
          </span>
          {isXyz(coin) && <span style={{ fontSize: 9, background: "#4a9eff18", border: "1px solid #4a9eff33", borderRadius: 3, padding: "2px 6px", color: "#4a9eff77", letterSpacing: "0.1em" }}>HIP-3</span>}
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {[{l:"7j",d:7},{l:"30j",d:30},{l:"90j",d:90}].map(p => (
            <button key={p.d} onClick={() => setPeriod(p.d)} style={{
              boxSizing: "border-box",
              background: period === p.d ? "#4a9eff22" : "transparent",
              border: `1px solid ${period === p.d ? "#4a9eff" : "#1e3a5f"}`,
              borderRadius: 4, color: period === p.d ? "#4a9eff" : "#555",
              fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: "6px 12px", cursor: "pointer",
              whiteSpace: "nowrap",
            }}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
        {Object.keys(MARKETS).map(cat => (
          <button key={cat} onClick={() => { setCategory(cat); handleCoinSelect(MARKETS[cat][0]); }} style={{
            background: category === cat ? "#4a9eff" : "transparent",
            border: `1px solid ${category === cat ? "#4a9eff" : "#1e3a5f"}`,
            borderRadius: 4, color: category === cat ? "#05050d" : "#555",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: category === cat ? 600 : 400,
            padding: "5px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
          }}>{cat}</button>
        ))}
      </div>

      {/* Coin selector + search */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <CoinSelector coins={MARKETS[category]} selected={coin} onSelect={handleCoinSelect} />
        <div style={{ display: "flex", flexShrink: 0 }}>
          <input value={inputCoin} onChange={e => setInputCoin(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSearch()} placeholder="Ticker..."
            style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRight: "none", borderRadius: "6px 0 0 6px", color: "#fff", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, padding: "6px 10px", width: 80, outline: "none" }} />
          <button onClick={handleSearch} style={{ background: "#4a9eff", border: "none", borderRadius: "0 6px 6px 0", color: "#05050d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>GO</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 12, width: "100%" }}>
          <StatCard
            label="Funding actuel" live={!!live}
            value={live ? <span style={{ color: parseFloat(live.funding) >= 0 ? "#00d4aa" : "#ff4d6d" }}>{(parseFloat(live.funding) * 100).toFixed(4)}%</span> : "—"}
            sub={live ? `APR: ${fmtAPR(toAPR(live.funding))}` : "En attente..."}
            color="#fff"
          />
          <StatCard label="Funding moyen / h" value={fmtRate(stats.avg / 100)} sub={`APR: ${fmtAPR(stats.avgApr)}`} color={stats.avg >= 0 ? "#00d4aa" : "#ff4d6d"} />
          <StatCard label="Max" value={fmtRate(stats.max / 100)} sub={`APR: ${fmtAPR(stats.maxApr)}`} color="#00d4aa" />
          <StatCard label="Min" value={fmtRate(stats.min / 100)} sub={`APR: ${fmtAPR(stats.minApr)}`} color="#ff4d6d" />
          <StatCard label="% positif" value={stats.positive + "%"} sub={`${stats.count} pts · ${period}j`} color="#4a9eff" />
        </div>
      )}

      {/* Chart */}
      <div style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRadius: 10, padding: "16px 4px 10px", height: 320, display: "flex", flexDirection: "column", marginBottom: 12, overflow: "hidden", minWidth: 0, width: "100%" }}>
        {loading && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a9eff", fontSize: 11, letterSpacing: "0.1em" }}>⟳ {loadingMsg}</div>}
        {error && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#ff4d6d", fontSize: 11, padding: "0 20px", textAlign: "center" }}>⚠ {error}</div>}
        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00d4aa" stopOpacity={0.01} />
                </linearGradient>
                <linearGradient id="negGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="5%" stopColor="#ff4d6d" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ff4d6d" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#0d1d35" vertical={false} />
              <XAxis dataKey="time" tickFormatter={fmtDateShort} tick={{ fill: "#333", fontSize: 9, fontFamily: "'IBM Plex Mono'" }} tickLine={false} axisLine={{ stroke: "#1e3a5f" }} interval="preserveStartEnd" />
              <YAxis tickFormatter={v => v.toFixed(4) + "%"} tick={{ fill: "#333", fontSize: 9, fontFamily: "'IBM Plex Mono'" }} tickLine={false} axisLine={false} width={68} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#2a4a6f" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="ratePos" fill="url(#posGrad)" stroke="none" />
              <Area type="monotone" dataKey="rateNeg" fill="url(#negGrad)" stroke="none" />
              <Line type="monotone" dataKey="rate" stroke="#4a9eff" strokeWidth={1.2} dot={false} activeDot={{ r: 3, fill: "#4a9eff", stroke: "#05050d", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table */}
      {data.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => { setShowTable(v => !v); setTablePage(0); }} style={{ background: showTable ? "#4a9eff22" : "transparent", border: "1px solid #1e3a5f", borderRadius: 4, color: showTable ? "#4a9eff" : "#444", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {showTable ? "▲ Masquer" : "▼ Données brutes"}
          </button>
        </div>
      )}
      {showTable && data.length > 0 && (
        <div style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 360 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                  {["Date","Heure","Rate","Premium","APR"].map(h => (
                    <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#4a9eff", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.map((row, i) => {
                  const p = row.rate >= 0; const d = new Date(row.time);
                  return (
                    <tr key={row.time} style={{ borderBottom: "1px solid #0d1525", background: i % 2 === 0 ? "transparent" : "#07070f" }}>
                      <td style={{ padding: "6px 12px", color: "#555" }}>{d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</td>
                      <td style={{ padding: "6px 12px", color: "#444" }}>{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ padding: "6px 12px", color: p ? "#00d4aa" : "#ff4d6d", fontWeight: 500 }}>{fmtRate(row.rawRate)}</td>
                      <td style={{ padding: "6px 12px", color: "#444" }}>{(parseFloat(row.rawPremium) * 100).toFixed(4)}%</td>
                      <td style={{ padding: "6px 12px", color: p ? "#00d4aa" : "#ff4d6d", fontWeight: 500 }}>{fmtAPR(row.apr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderTop: "1px solid #1e3a5f", alignItems: "center" }}>
            <button onClick={() => setTablePage(p => Math.max(0, p - 1))} disabled={tablePage === 0} style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 4, color: tablePage === 0 ? "#222" : "#555", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: tablePage === 0 ? "default" : "pointer" }}>←</button>
            <span style={{ fontSize: 10, color: "#333" }}>{tablePage + 1} / {totalPages}</span>
            <button onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))} disabled={tablePage >= totalPages - 1} style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 4, color: tablePage >= totalPages - 1 ? "#222" : "#555", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "4px 10px", cursor: tablePage >= totalPages - 1 ? "default" : "pointer" }}>→</button>
            <span style={{ fontSize: 9, color: "#2a2a3a", marginLeft: "auto" }}>{tableData.length} entrées</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ARBI (cross-exchange historical averages) ─────────────────────────────────
const ARBI_ASSETS = [
  "BTC","ETH","SOL","BNB","AVAX","ARB","OP","MATIC","LINK","SUI","APT","DYDX","WIF",
  "HYPE","PEPE","TRUMP","ADA","XRP","LTC","DOT","UNI","AAVE","CRV","GMX","JUP",
];

// Binance symbol overrides (some coins use multiplier prefix)
const BN_SYMBOL = { "PEPE": "1000PEPE", "SHIB": "1000SHIB", "FLOKI": "1000FLOKI" };
function bnSym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }
function bySym(c) { return (BN_SYMBOL[c] ?? c) + "USDT"; }

// Fetch Binance historical funding (one call, limit covers 90d @ 8h intervals = ~270 pts)
async function fetchBinanceHistory(coin) {
  try {
    const startTime = Date.now() - 91 * 24 * 3600 * 1000;
    const res = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${bnSym(coin)}&startTime=${startTime}&limit=1000`
    );
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

// Fetch Bybit historical funding (paginated, newest-first, up to 90d)
async function fetchBybitHistory(coin) {
  try {
    const startTime = Date.now() - 91 * 24 * 3600 * 1000;
    const all = [];
    let cursor = "";
    for (let p = 0; p < 4; p++) {
      const params = new URLSearchParams({ category: "linear", symbol: bySym(coin), limit: "200", startTime: String(startTime) });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://api.bybit.com/v5/market/funding/history?${params}`);
      if (!res.ok) break;
      const d = await res.json();
      const list = d.result?.list ?? [];
      all.push(...list);
      cursor = d.result?.nextPageCursor ?? "";
      if (!cursor || list.length < 200) break;
    }
    return all;
  } catch { return []; }
}

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
            fetchBinanceHistory(coin).catch(() => []),
            fetchBybitHistory(coin).catch(() => []),
          ]);

          const hl7  = hlRaw.filter(d => d.time  >= now - D7);
          const hl30 = hlRaw.filter(d => d.time  >= now - D30);
          const bn7  = bnRaw.filter(d => d.fundingTime >= now - D7);
          const bn30 = bnRaw.filter(d => d.fundingTime >= now - D30);
          // Bybit timestamps are strings in ms
          const by7  = byRaw.filter(d => +d.fundingRateTimestamp >= now - D7);
          const by30 = byRaw.filter(d => +d.fundingRateTimestamp >= now - D30);

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

  // Column groups: exchange → [key, label]
  const groups = [
    { label: "Hyperliquid", color: "#4a9eff", cols: [["hl7","7j"],["hl30","30j"],["hl90","90j"]] },
    { label: "Binance",     color: "#f0b90b", cols: [["bn7","7j"],["bn30","30j"],["bn90","90j"]] },
    { label: "Bybit",       color: "#e6a817", cols: [["by7","7j"],["by30","30j"],["by90","90j"]] },
  ];
  const allCols = groups.flatMap(g => g.cols);

  const thStyle = (col, first) => ({
    padding: "6px 10px", textAlign: "right",
    color: sortCol === col ? "#4a9eff" : "#555",
    fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
    fontWeight: sortCol === col ? 700 : 400, cursor: "pointer", userSelect: "none",
    borderLeft: first ? "1px solid #0d1525" : "none",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: "0 0 3px 0" }}>
            Arbitrage<span style={{ color: "#4a9eff" }}> · cross-exchange</span>
          </h2>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.08em" }}>
            APR moyen 7j / 30j / 90j — HL 1h×24×365 · Binance/Bybit 8h×3×365 · clic colonne pour trier
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runLoad} disabled={loading} style={{
            background: loading ? "transparent" : "#4a9eff22", border: `1px solid ${loading ? "#1e3a5f" : "#4a9eff"}`,
            borderRadius: 4, color: loading ? "#333" : "#4a9eff",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "6px 14px", cursor: loading ? "default" : "pointer", letterSpacing: "0.08em",
          }}>⟳ RAFRAÎCHIR</button>
          {loading && (
            <button onClick={() => abortRef.current = true} style={{ background: "#ff4d6d22", border: "1px solid #ff4d6d44", borderRadius: 4, color: "#ff4d6d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>■ STOP</button>
          )}
        </div>
      </div>

      {/* Progress */}
      {loading && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "#4a9eff", marginBottom: 4, letterSpacing: "0.08em" }}>
            {progress.done} / {progress.total} assets chargés
          </div>
          <div style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRadius: 4, height: 3, overflow: "hidden" }}>
            <div style={{ background: "#4a9eff", height: "100%", width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {sorted.length > 0 ? (
        <div style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRadius: 10, overflow: "hidden", flex: "1 1 auto" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 740 }}>
              <thead>
                {/* Group row */}
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
                {/* Sub-column row */}
                <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
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
                  <tr key={row.coin} style={{ borderBottom: "1px solid #0d1525", background: i % 2 === 0 ? "transparent" : "#07070f" }}>
                    <td style={{ padding: "7px 12px", color: "#e0e0e0", fontWeight: 500 }}>{row.coin}</td>
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
                      <button onClick={() => onNavigate(row.coin)} title="Explorer" style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 3, color: "#4a9eff", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, padding: "3px 7px", cursor: "pointer" }}>→</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "7px 12px", borderTop: "1px solid #1e3a5f", fontSize: 9, color: "#2a2a3a", display: "flex", justifyContent: "space-between" }}>
            <span>{sorted.length} assets · HL vs Binance Futures vs Bybit Linear · — = non disponible</span>
          </div>
        </div>
      ) : !loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a3a", fontSize: 11, letterSpacing: "0.1em" }}>
          Chargement des données cross-exchange...
        </div>
      )}
    </div>
  );
}

// ── COMPARE ───────────────────────────────────────────────────────────────────
function ComparePage({ onNavigate }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortCol, setSortCol] = useState("apr30");
  const [sortDir, setSortDir] = useState(-1);
  const [filterCat, setFilterCat] = useState("All");
  const abortRef = useRef(false);
  const hasLoaded = useRef(false);

  const calcAPR = (data) => {
    if (!data.length) return null;
    return data.reduce((s, d) => s + parseFloat(d.fundingRate), 0) / data.length * 100 * 24 * 365;
  };

  const fetchWithRetry = async (coin, days, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        if (i > 0) await new Promise(r => setTimeout(r, 500 * i));
        const data = await fetchAllFunding(coin, days);
        if (data.length > 0) return data;
      } catch {}
    }
    return [];
  };

  const runCompare = useCallback(async () => {
    setLoading(true); abortRef.current = false;
    const assets = ALL_ASSETS;
    setProgress({ done: 0, total: assets.length });
    const out = [];
    const CONCURRENCY = 2;
    for (let i = 0; i < assets.length; i += CONCURRENCY) {
      if (abortRef.current) break;
      const batch = assets.slice(i, i + CONCURRENCY);
      const batchRes = await Promise.all(batch.map(async (coin) => {
        try {
          const d90 = await fetchWithRetry(coin, 90);
          const now = Date.now();
          const d30 = d90.length ? d90.filter(d => d.time >= now - 30*24*3600*1000) : await fetchWithRetry(coin, 30);
          const d7  = d30.length ? d30.filter(d => d.time >= now - 7*24*3600*1000)  : await fetchWithRetry(coin, 7);
          return { coin, cat: getCat(coin), apr7: calcAPR(d7), apr30: calcAPR(d30), apr90: calcAPR(d90) };
        } catch { return { coin, cat: getCat(coin), apr7: null, apr30: null, apr90: null }; }
      }));
      out.push(...batchRes);
      setProgress(p => ({ ...p, done: Math.min(p.total, i + CONCURRENCY) }));
      setResults([...out]);
      if (i + CONCURRENCY < assets.length) await new Promise(r => setTimeout(r, 150));
    }
    setLoading(false);
  }, []);

  // Auto-load on first mount
  useEffect(() => {
    if (!hasLoaded.current && results.length === 0) {
      hasLoaded.current = true;
      runCompare();
    }
  }, [runCompare, results.length]);

  const handleSort = (col) => { if (sortCol === col) setSortDir(d => -d); else { setSortCol(col); setSortDir(-1); } };

  const CATS = ["All", ...Object.keys(MARKETS)];
  const sorted = [...results]
    .filter(r => filterCat === "All" || r.cat === filterCat)
    .sort((a, b) => sortDir * ((a[sortCol] ?? -9999) - (b[sortCol] ?? -9999)));

  const aprColor = (v) => {
    if (v === null) return "#333";
    if (v > 50) return "#00d4aa";
    if (v > 10) return "#7fdfcc";
    if (v > 0) return "#aaa";
    if (v > -10) return "#ff8fa0";
    return "#ff4d6d";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, width: "100%" }}>
      <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: "0 0 3px 0" }}>
            Comparaison APR<span style={{ color: "#4a9eff" }}> · tous les marchés</span>
          </h2>
          <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.08em" }}>APR moyen 7j / 30j / 90j — clic sur colonne pour trier</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={runCompare} disabled={loading} style={{
            background: loading ? "transparent" : "#4a9eff22", border: `1px solid ${loading ? "#1e3a5f" : "#4a9eff"}`,
            borderRadius: 4, color: loading ? "#333" : "#4a9eff",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 600,
            padding: "6px 14px", cursor: loading ? "default" : "pointer", letterSpacing: "0.08em",
          }}>⟳ RAFRAÎCHIR</button>
          {loading && (
            <button onClick={() => abortRef.current = true} style={{ background: "#ff4d6d22", border: "1px solid #ff4d6d44", borderRadius: 4, color: "#ff4d6d", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "6px 12px", cursor: "pointer" }}>■ STOP</button>
          )}
        </div>
      </div>

      {/* Progress */}
      {loading && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: "#4a9eff", marginBottom: 4, letterSpacing: "0.08em" }}>
            {progress.done} / {progress.total} assets chargés
          </div>
          <div style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRadius: 4, height: 3, overflow: "hidden" }}>
            <div style={{ background: "#4a9eff", height: "100%", width: `${(progress.done / progress.total) * 100}%`, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {CATS.map(cat => (
          <button key={cat} onClick={() => setFilterCat(cat)} style={{
            background: filterCat === cat ? "#4a9eff22" : "transparent",
            border: `1px solid ${filterCat === cat ? "#4a9eff" : "#1e3a5f"}`,
            borderRadius: 4, color: filterCat === cat ? "#4a9eff" : "#555",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
            padding: "5px 10px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em",
          }}>{cat}</button>
        ))}
      </div>

      {/* Table */}
      {sorted.length > 0 ? (
        <div style={{ background: "#0a0a18", border: "1px solid #1e3a5f", borderRadius: 10, overflow: "hidden", flex: "1 1 auto" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", minWidth: 380 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#333", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 400, width: 28 }}>#</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#4a9eff", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500 }}>Asset</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#444", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 400 }}>Cat</th>
                  {[["apr7","APR 7j"],["apr30","APR 30j"],["apr90","APR 90j"]].map(([col, label]) => (
                    <th key={col} onClick={() => handleSort(col)} style={{
                      padding: "10px 12px", textAlign: "right",
                      color: sortCol === col ? "#4a9eff" : "#555",
                      fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase",
                      fontWeight: sortCol === col ? 700 : 400, cursor: "pointer", userSelect: "none",
                    }}>{label}{sortCol === col ? (sortDir === -1 ? " ↓" : " ↑") : ""}</th>
                  ))}
                  <th style={{ padding: "10px 12px", width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.coin} style={{ borderBottom: "1px solid #0d1525", background: i % 2 === 0 ? "transparent" : "#07070f" }}>
                    <td style={{ padding: "7px 12px", color: "#2a2a3a", fontSize: 10 }}>{i + 1}</td>
                    <td style={{ padding: "7px 12px", color: "#e0e0e0", fontWeight: 500 }}>{row.coin}</td>
                    <td style={{ padding: "7px 12px", color: "#444", fontSize: 10 }}>{row.cat}</td>
                    {["apr7","apr30","apr90"].map(col => (
                      <td key={col} style={{ padding: "7px 12px", textAlign: "right", color: aprColor(row[col]), fontWeight: sortCol === col ? 600 : 400 }}>
                        {row[col] !== null ? fmtAPR(row[col]) : "—"}
                      </td>
                    ))}
                    <td style={{ padding: "7px 12px", textAlign: "center" }}>
                      <button onClick={() => onNavigate(row.coin)} style={{ background: "transparent", border: "1px solid #1e3a5f", borderRadius: 3, color: "#4a9eff", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, padding: "3px 7px", cursor: "pointer" }}>→</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "7px 12px", borderTop: "1px solid #1e3a5f", fontSize: 9, color: "#2a2a3a", display: "flex", justifyContent: "space-between" }}>
            <span>{sorted.length} assets</span>
            <span>Dernière mise à jour: {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        </div>
      ) : !loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a3a", fontSize: 11, letterSpacing: "0.1em" }}>
          Chargement des données...
        </div>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("explorer");
  const [explorerCoin, setExplorerCoin] = useState("HYPE");

  const navigateToExplorer = (coin) => { setExplorerCoin(coin); setPage("explorer"); };

  return (
    <div style={{
      minHeight: "100vh", background: "#05050d", color: "#e0e0e0",
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        html, body { margin: 0; padding: 0; width: 100%; min-height: 100vh; background: #05050d; }
        #root { width: 100%; min-height: 100vh; }
      `}</style>
      <div style={{
        maxWidth: 1100,
        width: "100%",
        margin: "0 auto",
        padding: "clamp(14px,3vw,28px) clamp(16px,4vw,32px)",
        boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        minHeight: "100vh",
        overflow: "hidden",
      }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "nowrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, overflow: "hidden" }}>
            <span style={{ fontSize: 10, letterSpacing: "0.2em", color: "#4a9eff", textTransform: "uppercase", flexShrink: 0 }}>Hyperliquid</span>
            <span style={{ color: "#1e3a5f", flexShrink: 0 }}>|</span>
            <span style={{ fontSize: 10, color: "#333", letterSpacing: "0.08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>FUNDING RATE EXPLORER</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {[["explorer","Explorer"],["compare","Comparer"],["arbi","Arbi"]].map(([id, label]) => (
              <button key={id} onClick={() => setPage(id)} style={{
                boxSizing: "border-box",
                background: page === id ? "#4a9eff" : "transparent",
                border: `1px solid ${page === id ? "#4a9eff" : "#1e3a5f"}`,
                borderRadius: 4, color: page === id ? "#05050d" : "#555",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: page === id ? 700 : 400,
                padding: "7px 18px", cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {page === "explorer"
            ? <ExplorerPage key={explorerCoin} initialCoin={explorerCoin} />
            : page === "compare"
            ? <ComparePage onNavigate={navigateToExplorer} />
            : <ArbitragePage onNavigate={navigateToExplorer} />
          }
        </div>

        <div style={{ fontSize: 9, color: "#1a1a2a", textAlign: "right", letterSpacing: "0.08em", marginTop: 12 }}>
          HYPERLIQUID · BINANCE · BYBIT · APR = RATE × FREQ × 365
        </div>
      </div>
    </div>
  );
}
