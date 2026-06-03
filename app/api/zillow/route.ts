// app/api/zillow/route.ts
// Edge runtime. Resolves the DATA for an address typed in the submission form
// via the RapidAPI Zillow scraper. Key bound as RAPIDAPI_KEY secret.
//
// Primary use:
//   GET /api/zillow?address=2186 Lelani Cir, Davenport FL 33897
//     → { ok, normalized: { address, zestimate, price, beds, baths, sqft,
//                           homeType, zillow_url, image, zpid }, raw }
//
// Also supported:
//   GET /api/zillow?url=https://www.zillow.com/homedetails/...
//   GET /api/zillow?path=/anyExactPath&q=...   ← escape hatch (raw passthrough)

export const runtime = "edge";
export const dynamic = "force-dynamic";

const HOST = "zillow-com-live-data-scraper-api.p.rapidapi.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function callZillow(path: string, key: string) {
  const r = await fetch(`https://${HOST}${path}`, {
    method: "GET",
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data, text };
}

// ── Deep, shape-agnostic property extraction ──────────────────────────────
// The scraper's JSON shape varies per endpoint, so we walk the tree and grab
// the first node that looks like a property (has a price/zestimate + address).
type AnyObj = Record<string, unknown>;

function looksLikeProperty(node: AnyObj): boolean {
  const keys = Object.keys(node).map(k => k.toLowerCase());
  const money = keys.some(k => k.includes("zestimate") || k === "price" || k === "listprice" || k.includes("unformattedprice") || k.includes("estimate"));
  const prop  = keys.some(k => k.includes("address") || k.includes("bedroom") || k === "beds" || k.includes("livingarea") || k === "sqft" || k === "zpid");
  return money && prop;
}

function findProperty(data: unknown): AnyObj | null {
  let best: AnyObj | null = null;
  const visit = (node: unknown, depth: number) => {
    if (best || !node || typeof node !== "object" || depth > 7) return;
    if (Array.isArray(node)) { for (const it of node) visit(it, depth + 1); return; }
    const obj = node as AnyObj;
    if (looksLikeProperty(obj)) { best = obj; return; }
    for (const k of Object.keys(obj)) visit(obj[k], depth + 1);
  };
  visit(data, 0);
  return best;
}

function field(obj: AnyObj, names: string[]): unknown {
  for (const k of Object.keys(obj)) {
    if (names.includes(k.toLowerCase())) return obj[k];
  }
  return undefined;
}
function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : undefined;
}

function normalize(data: unknown) {
  const p = findProperty(data) || (typeof data === "object" && data ? data as AnyObj : {});
  const addrRaw = field(p, ["address"]);
  let address = "";
  if (addrRaw && typeof addrRaw === "object") {
    const a = addrRaw as AnyObj;
    address = [a.streetAddress, a.city, a.state, a.zipcode].filter(Boolean).join(", ");
  } else if (typeof addrRaw === "string") {
    address = addrRaw;
  } else {
    address = String(field(p, ["fulladdress", "streetaddress"]) || "");
  }
  let zUrl = String(field(p, ["url", "detailurl", "hdpurl"]) || "");
  if (zUrl && zUrl.startsWith("/")) zUrl = "https://www.zillow.com" + zUrl;
  const photos = field(p, ["photos"]);
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
    zillow_url: zUrl || undefined,
    image: (image as string) || undefined,
    zpid: (field(p, ["zpid"]) as string | number) || undefined,
  };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return json({ ok: false, error: "Missing RAPIDAPI_KEY env var" }, 500);

    const url     = new URL(req.url);
    const address = (url.searchParams.get("address") || url.searchParams.get("q") || "").trim();
    const zUrl    = (url.searchParams.get("url") || "").trim();
    const exact   = url.searchParams.get("path");

    // Escape hatch: hit any exact endpoint, return raw
    if (exact) {
      const path = exact.startsWith("/") ? exact : `/${exact}`;
      const r = await callZillow(path, key);
      if (!r.ok) return json({ ok: false, error: `Upstream ${r.status}`, body: r.text.slice(0, 600) }, r.status);
      return json({ ok: true, path, normalized: normalize(r.data), raw: r.data });
    }

    if (!address && !zUrl) return json({ ok: false, error: "address (or url) required" }, 400);

    // 1) If a Zillow URL was provided, fetch it directly.
    if (zUrl) {
      const r = await callZillow(`/byurl?url=${encodeURIComponent(zUrl)}`, key);
      if (!r.ok) return json({ ok: false, error: `Zillow upstream ${r.status}`, body: r.text.slice(0, 400) }, r.status);
      return json({ ok: true, source: "url", normalized: normalize(r.data), raw: r.data });
    }

    // 2) Address flow: resolve the typed address → property record.
    //    a) autocomplete to pin the exact place / detail URL
    let detailUrl = "";
    try {
      const ac = await callZillow(`/autocomplete?query=${encodeURIComponent(address)}`, key);
      if (ac.ok) {
        const hit = findProperty(ac.data) || (ac.data as AnyObj);
        const u = field(hit || {}, ["url", "detailurl", "hdpurl"]);
        if (typeof u === "string" && u) detailUrl = u.startsWith("/") ? `https://www.zillow.com${u}` : u;
      }
    } catch { /* autocomplete is best-effort */ }

    //    b) if we got a detail URL, fetch full property data by URL
    if (detailUrl) {
      const r = await callZillow(`/byurl?url=${encodeURIComponent(detailUrl)}`, key);
      if (r.ok) {
        const normalized = normalize(r.data);
        if (normalized.zestimate || normalized.price || normalized.beds) {
          return json({ ok: true, source: "address->url", normalized: { ...normalized, address: normalized.address || address }, raw: r.data });
        }
      }
    }

    //    c) fallback: location search for the address string
    const loc = await callZillow(`/bylocation?location=${encodeURIComponent(address)}&page=1`, key);
    if (!loc.ok) return json({ ok: false, error: `Zillow upstream ${loc.status}`, body: loc.text.slice(0, 400) }, loc.status);
    const normalized = normalize(loc.data);
    return json({ ok: true, source: "address->location", normalized: { ...normalized, address: normalized.address || address }, raw: loc.data });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
