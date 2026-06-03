// app/api/zillow/route.ts
// Edge runtime. Proxies Zillow lookups through the RapidAPI scraper
// (zillow-com-live-data-scraper-api) so the API key never ships to the client.
//
// Usage:
//   GET /api/zillow?type=address&q=123+Main+St,+Miami+FL
//   GET /api/zillow?type=mlsid&q=123456
//   GET /api/zillow?type=zpid&q=12345678
//   GET /api/zillow?type=url&q=https://www.zillow.com/homedetails/...
//
// Returns: { ok: true, type, data: <raw API response> }
//          or { ok: false, error: "..." } with the upstream status.

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HOST = "zillow-com-live-data-scraper-api.p.rapidapi.com";

// Whitelist supported lookup types → upstream paths
const PATHS: Record<string, (q: string, page: string) => string> = {
  address: (q, page) => `/byaddress?address=${encodeURIComponent(q)}&page=${page}`,
  mlsid:   (q, page) => `/bymlsid?mlsid=${encodeURIComponent(q)}&page=${page}`,
  zpid:    (q)       => `/byzpid?zpid=${encodeURIComponent(q)}`,
  url:     (q)       => `/byurl?url=${encodeURIComponent(q)}`,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: Request): Promise<Response> {
  try {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return json({ ok: false, error: "Missing RAPIDAPI_KEY env var" }, 500);

    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "address").toLowerCase();
    const q    = url.searchParams.get("q") || "";
    const page = url.searchParams.get("page") || "1";

    if (!q) return json({ ok: false, error: "q (query) required" }, 400);
    const buildPath = PATHS[type];
    if (!buildPath) return json({ ok: false, error: `Unsupported type '${type}'. Use: address | mlsid | zpid | url` }, 400);

    const upstream = await fetch(`https://${HOST}${buildPath(q, page)}`, {
      method: "GET",
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": HOST,
      },
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      return json({ ok: false, error: `Zillow upstream ${upstream.status}`, body: text.slice(0, 500) }, upstream.status);
    }

    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return json({ ok: true, type, data });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
