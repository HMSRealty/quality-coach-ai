// app/api/zillow/route.ts
// Edge runtime. Fetches the EXACT property the user typed by resolving the
// address → its Zillow zpid (via autocomplete) → full record (via byurl).
// Never falls back to area search, which would return a different house.
//
//   GET /api/zillow?address=1476 Cambridge Ave, College Park, GA 30337
//   GET /api/zillow?url=https://www.zillow.com/homedetails/.../452099216_zpid/
//   GET /api/zillow?address=...&debug=1   → includes autocomplete + chosen zpid
//   GET /api/zillow?path=/anyEndpoint&q=...  → raw passthrough (escape hatch)

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

type AnyObj = Record<string, unknown>;

// Recursively find the FIRST zpid in a payload (top autocomplete suggestion
// for an exact address = the property the user typed).
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
    if (best || !node || typeof node !== "object" || depth > 7) return;
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
  const photos = field(p, ["photos", "images"]);
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

// Leading street number, for sanity-checking the resolved property matches.
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

    // Escape hatch — raw passthrough to any endpoint
    if (exact) {
      const path = exact.startsWith("/") ? exact : `/${exact}`;
      const r = await callZillow(path, key);
      if (!r.ok) return json({ ok: false, error: `Upstream ${r.status}`, body: r.text.slice(0, 800) }, r.status);
      return json({ ok: true, path, normalized: normalize(r.data), raw: r.data });
    }

    // Direct Zillow URL → exact property
    if (zUrl) {
      const r = await callZillow(`/byurl?url=${encodeURIComponent(zUrl)}`, key);
      if (!r.ok) return json({ ok: false, error: `Zillow ${r.status}`, body: r.text.slice(0, 400) }, r.status);
      return json({ ok: true, source: "url", normalized: normalize(r.data), ...(debug ? { raw: r.data } : {}) });
    }

    if (!address) return json({ ok: false, error: "address (or url) required" }, 400);

    // STEP 1 — resolve the typed address to its exact zpid
    const ac = await callZillow(`/autocomplete?query=${encodeURIComponent(address)}`, key);
    if (!ac.ok) {
      return json({ ok: false, error: `Address lookup failed (autocomplete ${ac.status}).`, ...(debug ? { acRaw: ac.data } : {}) }, ac.status);
    }
    const zpid = firstZpid(ac.data);
    if (!zpid) {
      return json({
        ok: false,
        error: "Couldn't match that exact address on Zillow. Double-check spelling and include the ZIP code.",
        ...(debug ? { acRaw: ac.data } : {}),
      }, 404);
    }

    // STEP 2 — fetch the exact property by its zpid URL
    const detailUrl = `https://www.zillow.com/homedetails/${zpid}_zpid/`;
    const r = await callZillow(`/byurl?url=${encodeURIComponent(detailUrl)}`, key);
    if (!r.ok) {
      return json({ ok: false, error: `Found the property but failed to load it (byurl ${r.status}).`, zpid, ...(debug ? { raw: r.data } : {}) }, r.status);
    }
    const normalized = normalize(r.data);

    // Sanity check: the resolved street number should match what was typed.
    const typedNum = streetNum(address);
    const gotNum   = streetNum(normalized.address || "");
    const mismatch = typedNum && gotNum && typedNum !== gotNum;

    return json({
      ok: true,
      source: "address->zpid->url",
      zpid,
      match: !mismatch,
      ...(mismatch ? { warning: `Resolved to ${normalized.address} — verify this matches the address you entered.` } : {}),
      normalized: { ...normalized, address: normalized.address || address },
      ...(debug ? { raw: r.data, acRaw: ac.data } : {}),
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
