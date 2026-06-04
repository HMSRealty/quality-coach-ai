// app/api/zillow/route.ts
// Edge runtime. Fetches the EXACT property the user typed.
//   1) resolve the address → its Zillow zpid (autocomplete / search-URL)
//   2) pull the full record from private-zillow /byurl  (the data API you chose)
//
//   GET /api/zillow?address=2762 Downing St, Jacksonville, FL 32205
//   GET /api/zillow?url=https://www.zillow.com/homedetails/.../44471319_zpid/
//   GET /api/zillow?address=...&debug=1   → includes raw + how it resolved
//   GET /api/zillow?path=/byurl?url=...   → raw passthrough on the data host

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Data API (returns the full property record from a Zillow detail URL)
const HOST_DATA = "private-zillow.p.rapidapi.com";
// Resolver API (turns a typed address into a zpid) — same RapidAPI key
const HOST_RESOLVE = "zillow-com-live-data-scraper-api.p.rapidapi.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function call(host: string, path: string, key: string) {
  const r = await fetch(`https://${host}${path}`, {
    method: "GET",
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data, text };
}

type AnyObj = Record<string, unknown>;

// "2762 Downing St, Jacksonville, FL 32205" → "2762-Downing-St-Jacksonville-FL-32205"
function addressSlug(addr: string): string {
  return addr.trim()
    .replace(/[.,#]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Recursively find the first zpid in any payload.
function firstZpid(data: unknown): string | null {
  let found: string | null = null;
  const visit = (n: unknown) => {
    if (found || !n || typeof n !== "object") return;
    if (Array.isArray(n)) { for (const x of n) visit(x); return; }
    for (const [k, v] of Object.entries(n as AnyObj)) {
      if (found) return;
      if (k.toLowerCase() === "zpid" && v != null && /^\d{4,}$/.test(String(v))) { found = String(v); return; }
      visit(v);
    }
  };
  visit(data);
  return found;
}

function field(obj: AnyObj, names: string[]): unknown {
  for (const k of Object.keys(obj)) if (names.includes(k.toLowerCase())) return obj[k];
  return undefined;
}
function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : undefined;
}
function looksLikeProperty(node: AnyObj): boolean {
  const keys = Object.keys(node).map(k => k.toLowerCase());
  const money = keys.some(k => k.includes("zestimate") || k === "price" || k === "listprice" || k.includes("unformattedprice"));
  const prop  = keys.some(k => k.includes("bedroom") || k === "beds" || k.includes("livingarea") || k === "zpid" || k.includes("address"));
  return money && prop;
}
function findProperty(data: unknown): AnyObj | null {
  let best: AnyObj | null = null;
  const visit = (node: unknown, depth: number) => {
    if (best || !node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { for (const it of node) visit(it, depth + 1); return; }
    const obj = node as AnyObj;
    if (looksLikeProperty(obj)) { best = obj; return; }
    for (const k of Object.keys(obj)) visit(obj[k], depth + 1);
  };
  visit(data, 0);
  return best;
}

function normalize(data: unknown) {
  const p = findProperty(data) || (typeof data === "object" && data ? data as AnyObj : {});
  const addrRaw = field(p, ["address"]);
  let address = "";
  if (addrRaw && typeof addrRaw === "object") {
    const a = addrRaw as AnyObj;
    address = [a.streetAddress, a.city, a.state, a.zipcode].filter(Boolean).join(", ");
  } else if (typeof addrRaw === "string") address = addrRaw;
  else address = String(field(p, ["fulladdress", "streetaddress"]) || "");

  let zUrl = String(field(p, ["url", "detailurl", "hdpurl"]) || "");
  if (zUrl && zUrl.startsWith("/")) zUrl = "https://www.zillow.com" + zUrl;
  const photos = field(p, ["photos", "images", "responsivephotos"]);
  const image = field(p, ["imgsrc", "image"]) ||
    (Array.isArray(photos) && photos[0] && typeof photos[0] === "object" ? (photos[0] as AnyObj).url : undefined);

  return {
    address: address || undefined,
    zestimate: num(field(p, ["zestimate", "zestimatevalue"])),
    price: num(field(p, ["price", "listprice", "unformattedprice"])),
    beds: num(field(p, ["bedrooms", "beds"])),
    baths: num(field(p, ["bathrooms", "baths"])),
    sqft: num(field(p, ["livingarea", "livingareavalue", "area", "sqft"])),
    homeType: (field(p, ["hometype", "propertytype", "statustype"]) as string) || undefined,
    yearBuilt: num(field(p, ["yearbuilt"])),
    zillow_url: zUrl || undefined,
    image: (image as string) || undefined,
    zpid: (field(p, ["zpid"]) as string | number) || undefined,
  };
}

function hasData(n: ReturnType<typeof normalize>): boolean {
  return !!(n.zestimate || n.price || n.beds || n.baths || n.sqft);
}
function streetNum(s: string): string {
  const m = (s || "").trim().match(/^\d+/);
  return m ? m[0] : "";
}

export async function GET(req: Request): Promise<Response> {
  try {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return json({ ok: false, error: "Missing RAPIDAPI_KEY env var" }, 500);

    const url     = new URL(req.url);
    const address = (url.searchParams.get("address") || url.searchParams.get("q") || "").trim();
    const zUrl    = (url.searchParams.get("url") || "").trim();
    const exact   = url.searchParams.get("path");
    const debug   = url.searchParams.get("debug") === "1";

    // Escape hatch — raw passthrough to the data host
    if (exact) {
      const path = exact.startsWith("/") ? exact : `/${exact}`;
      const r = await call(HOST_DATA, path, key);
      if (!r.ok) return json({ ok: false, error: `Upstream ${r.status}`, body: r.text.slice(0, 800) }, r.status);
      return json({ ok: true, path, normalized: normalize(r.data), raw: r.data });
    }

    // Direct Zillow URL → fetch the exact property via the data API
    if (zUrl) {
      const r = await call(HOST_DATA, `/byurl?url=${encodeURIComponent(zUrl)}`, key);
      if (!r.ok) return json({ ok: false, error: `Zillow ${r.status}`, body: r.text.slice(0, 400) }, r.status);
      return json({ ok: true, source: "url", normalized: normalize(r.data), ...(debug ? { raw: r.data } : {}) });
    }

    if (!address) return json({ ok: false, error: "address (or url) required" }, 400);

    const attempts: Array<{ via: string; url: string; status: number }> = [];

    // STRATEGY A — build Zillow's address search URL and let /byurl resolve it.
    const slug = addressSlug(address);
    const searchUrls = [
      `https://www.zillow.com/homes/${slug}_rb/`,
      `https://www.zillow.com/homedetails/${slug}/`,
    ];
    for (const su of searchUrls) {
      const r = await call(HOST_DATA, `/byurl?url=${encodeURIComponent(su)}`, key);
      attempts.push({ via: "byurl(search)", url: su, status: r.status });
      if (r.ok) {
        const n = normalize(r.data);
        if (hasData(n)) {
          return finish(n, address, "address->searchurl", debug ? r.data : undefined, attempts);
        }
      }
    }

    // STRATEGY B — resolve the address → zpid (resolver host), then /byurl the
    // canonical _zpid detail URL on the data host.
    let zpid: string | null = null;
    let acRaw: unknown = undefined;
    try {
      const ac = await call(HOST_RESOLVE, `/autocomplete?query=${encodeURIComponent(address)}`, key);
      attempts.push({ via: "autocomplete", url: "/autocomplete", status: ac.status });
      acRaw = ac.data;
      if (ac.ok) zpid = firstZpid(ac.data);
    } catch { /* resolver is best-effort */ }

    if (zpid) {
      const detailUrl = `https://www.zillow.com/homedetails/${zpid}_zpid/`;
      const r = await call(HOST_DATA, `/byurl?url=${encodeURIComponent(detailUrl)}`, key);
      attempts.push({ via: "byurl(zpid)", url: detailUrl, status: r.status });
      if (r.ok) {
        const n = normalize(r.data);
        return finish(n, address, "address->zpid->byurl", debug ? r.data : undefined, attempts);
      }
    }

    return json({
      ok: false,
      error: "Couldn't fetch that exact address. Double-check spelling and include the ZIP code.",
      ...(debug ? { attempts, acRaw } : {}),
    }, 404);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

function finish(
  n: ReturnType<typeof normalize>,
  typedAddress: string,
  source: string,
  raw: unknown | undefined,
  attempts: Array<{ via: string; url: string; status: number }>,
): Response {
  const typed = streetNum(typedAddress);
  const got = streetNum(n.address || "");
  const mismatch = typed && got && typed !== got;
  return json({
    ok: true,
    source,
    match: !mismatch,
    ...(mismatch ? { warning: `Resolved to ${n.address} — verify this matches what you entered.` } : {}),
    normalized: { ...n, address: n.address || typedAddress },
    ...(raw !== undefined ? { raw, attempts } : {}),
  });
}
