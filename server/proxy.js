// Generic CORS proxy for venues that block browser requests
// Only allows proxying to allowlisted base URLs

const PROXY_BASES = {
  boros:    "https://api.boros.finance/core",
  lighter:  "https://mainnet.zklighter.elliot.ai/api/v1",
  asterdex: "https://fapi.asterdex.com",
};

export function mountProxy(app) {
  app.all("/api/proxy/:venue/*", async (req, res) => {
    const base = PROXY_BASES[req.params.venue];
    if (!base) return res.status(404).json({ error: "unknown proxy venue" });

    const path = req.params[0];
    const qs = new URLSearchParams(req.query).toString();
    const url = `${base}/${path}${qs ? "?" + qs : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const upstream = await fetch(url, {
        method: req.method === "POST" ? "POST" : "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        ...(req.method === "POST" ? { body: JSON.stringify(req.body) } : {}),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await upstream.text();
      res
        .status(upstream.status)
        .set("Content-Type", upstream.headers.get("content-type") || "application/json")
        .send(data);
    } catch (e) {
      clearTimeout(timeout);
      const status = e.name === "AbortError" ? 504 : 502;
      res.status(status).json({ error: "upstream error", message: e.message });
    }
  });
}
