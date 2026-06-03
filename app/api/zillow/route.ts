// app/api/zillow/route.ts
// Edge runtime. Proxies Zillow lookups through the RapidAPI scraper
// (zillow-com-live-data-scraper-api). Key bound as RAPIDAPI_KEY secret.
//
// Real endpoints exposed by this API (per RapidAPI playground):
//   Properties:  /bymlsid /bymapbounds /bypolygon /bylocation /bycoordinates
//                /apartmentDetails /byurl
//   Agents:      /agentInfo /agentSoldProperties /agentReviews /agentBylocation
//                /agentForRentProperties /agentForSaleProperties
//   Utilities:   /autocomplete
//
// Usage:
//   GET /api/zillow?type=location&q=2186+Lelani+Cir,+Davenport+FL
//   GET /api/zillow?type=mlsid&q=123456
//   GET /api/zillow?type=url&q=https://zillow.com/...
//   GET /api/zillow?type=autocomplete&q=2186+Lelani
//   GET /api/zillow?path=/anyExactPath&q=...        ← escape hatch

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HOST = "zillow-com-live-data-scraper-api.p.rapidapi.com";

const PATHS: Record<string, (q: string, page: string) => string> = {
  location:     (q, p) => `/bylocation?location=${encodeURIComponent(q)}&page=${p}`,
  address:      (q, p) => `/bylocation?location=${encodeURIComponent(q)}&page=${p}`, // alias
  mlsid:        (q, p) => `/bymlsid?mlsid=${encodeURIComponent(q)}&page=${p}`,
  url:          (q)    => `/byurl?url=${encodeURIComponent(q)}`,
  autocomplete: (q)    => `/autocomplete?query=${encodeURIComponent(q)}`,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: Request): Promise<Response> {
  try {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return json({ ok: false, error: "Missing RAPIDAPI_KEY env var" }, 500);

    const url   = new URL(req.url);
    const type  = (url.searchParams.get("type") || "location").toLowerCase();
    const q     = url.searchParams.get("q") || "";
    const page  = url.searchParams.get("page") || "1";
    const exact = url.searchParams.get("path");

    if (!q && !exact) return json({ ok: false, error: "q (query) required" }, 400);

    const path = exact
      ? (exact.startsWith("/") ? exact : `/${exact}`)
      : (PATHS[type] ? PATHS[type](q, page) : null);

    if (!path) return json({ ok: false, error: `Unsupported type '${type}'. Use: location | mlsid | url | autocomplete, or pass &path=/yourPath` }, 400);

    const resp = await fetch(`https://${HOST}${path}`, {
      method: "GET",
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
    });
    const text = await resp.text();
    if (!resp.ok) {
      return json({ ok: false, error: `Zillow upstream ${resp.status}`, path, body: text.slice(0, 500) }, resp.status);
    }
    try { return json({ ok: true, type, path, data: JSON.parse(text) }); }
    catch { return json({ ok: true, type, path, data: { raw: text } }); }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
