// app/api/zillow/route.ts
// Edge runtime. Proxies Zillow lookups through RapidAPI scrapers.
// Key never reaches the client — bound as `RAPIDAPI_KEY` secret on Pages.
//
// Usage:
//   GET /api/zillow?type=address&q=123+Main+St           ← tries common address endpoints
//   GET /api/zillow?type=mlsid&q=123456                  ← /bymlsid
//   GET /api/zillow?type=zpid&q=12345678                 ← /byzpid
//   GET /api/zillow?type=url&q=https://zillow.com/...   ← tries URL endpoints
//   GET /api/zillow?path=/whatever&q=...                 ← escape hatch — call any exact path
//   GET /api/zillow?probe=1                              ← tells you which address endpoint works

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HOST = "zillow-com-live-data-scraper-api.p.rapidapi.com";

// Multiple Zillow scrapers on RapidAPI use different endpoint names for the
// same lookup. We try each in order until one returns 200.
const CANDIDATES: Record<string, Array<(q: string, page: string) => string>> = {
  address: [
    (q, p) => `/property?address=${encodeURIComponent(q)}&page=${p}`,
    (q, p) => `/search?location=${encodeURIComponent(q)}&page=${p}`,
    (q)    => `/propertyExtendedSearch?location=${encodeURIComponent(q)}`,
    (q)    => `/searchByAddress?address=${encodeURIComponent(q)}`,
    (q)    => `/getProperty?address=${encodeURIComponent(q)}`,
    (q)    => `/zestimate?address=${encodeURIComponent(q)}`,
    (q, p) => `/byaddress?address=${encodeURIComponent(q)}&page=${p}`,
  ],
  mlsid: [
    (q, p) => `/bymlsid?mlsid=${encodeURIComponent(q)}&page=${p}`,
  ],
  zpid: [
    (q) => `/byzpid?zpid=${encodeURIComponent(q)}`,
    (q) => `/property?zpid=${encodeURIComponent(q)}`,
    (q) => `/getZestimate?zpid=${encodeURIComponent(q)}`,
  ],
  url: [
    (q) => `/byurl?url=${encodeURIComponent(q)}`,
    (q) => `/property?url=${encodeURIComponent(q)}`,
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function call(path: string, key: string) {
  const r = await fetch(`https://${HOST}${path}`, {
    method: "GET",
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return json({ ok: false, error: "Missing RAPIDAPI_KEY env var" }, 500);

    const url   = new URL(req.url);
    const type  = (url.searchParams.get("type") || "address").toLowerCase();
    const q     = url.searchParams.get("q") || "";
    const page  = url.searchParams.get("page") || "1";
    const exact = url.searchParams.get("path"); // escape hatch
    const probe = url.searchParams.get("probe") === "1";

    if (!q && !exact) return json({ ok: false, error: "q (query) required" }, 400);

    // Direct path mode
    if (exact) {
      const path = exact.startsWith("/") ? exact : `/${exact}`;
      const r = await call(path, key);
      if (!r.ok) return json({ ok: false, error: `Upstream ${r.status}`, body: r.text.slice(0, 500) }, r.status);
      try { return json({ ok: true, path, data: JSON.parse(r.text) }); }
      catch { return json({ ok: true, path, data: { raw: r.text } }); }
    }

    // Probe mode: try every address candidate, report which ones exist
    if (probe) {
      const results: Array<{ path: string; status: number; preview: string }> = [];
      for (const build of CANDIDATES.address) {
        const path = build(q || "test", page);
        const r = await call(path, key);
        results.push({ path, status: r.status, preview: r.text.slice(0, 120) });
      }
      return json({ ok: true, type: "probe", results });
    }

    const candidates = CANDIDATES[type];
    if (!candidates) return json({ ok: false, error: `Unsupported type '${type}'. Use: address | mlsid | zpid | url, or pass &path=/yourPath` }, 400);

    let lastErr = "";
    for (const build of candidates) {
      const path = build(q, page);
      const r = await call(path, key);
      if (r.ok) {
        try { return json({ ok: true, type, path, data: JSON.parse(r.text) }); }
        catch { return json({ ok: true, type, path, data: { raw: r.text } }); }
      }
      lastErr = `${r.status} on ${path}: ${r.text.slice(0, 150)}`;
      // Don't keep trying after non-404s (e.g. 401, 429) — those mean the key/host is the problem
      if (r.status !== 404) break;
    }
    return json({ ok: false, error: `No matching endpoint found. Last try: ${lastErr}` }, 404);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
