// app/api/zillow/route.ts
// Edge runtime. Fetches the EXACT property the user typed.
//   1) resolve the address → its Zillow zpid via private-zillow /autocomplete
//   2) pull the full record from private-zillow /byurl  (the data API)
// Both calls hit the SAME private-zillow host with the SAME RapidAPI key.
//
//   GET /api/zillow?address=2762 Downing St, Jacksonville, FL 32205
//   GET /api/zillow?url=https://www.zillow.com/homedetails/.../44471319_zpid/
//   GET /api/zillow?address=...&debug=1   → includes raw + how it resolved
//   GET /api/zillow?path=/byurl?url=...   → raw passthrough on the data host

export const runtime = "edge";
export const dynamic = "force-dynamic";

// One host does it all: /autocomplete (address → zpid) and /byurl (zpid → record)
const HOST_DATA = "private-zillow.p.rapidapi.com";

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
  // private-zillow nests the address under "PropertyAddress" {streetAddress, city, state, zipcode}
  const addrRaw = field(p, ["propertyaddress", "address"]);
  let address = "";
  if (addrRaw && typeof addrRaw === "object") {
    const a = addrRaw as AnyObj;
    address = [a.streetAddress, a.city, a.state, a.zipcode].filter(Boolean).join(", ");
  } else if (typeof addrRaw === "string") address = addrRaw;
  else address = String(field(p, ["fulladdress", "streetaddress"]) || "");

  let zUrl = String(field(p, ["propertyzillowurl", "url", "detailurl", "hdpurl"]) || "");
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
    sqft: num(field(p, ["area(sqft)", "livingarea", "livingareavalue", "area", "sqft"])),
    homeType: (field(p, ["hometype", "propertytype", "statustype"]) as string) || undefined,
    yearBuilt: num(field(p, ["yearbuilt"])),
    zillow_url: zUrl || undefined,
    image: (image as string) || undefined,
    zpid: (field(p, ["propertyzpid", "zpid"]) as string | number) || undefined,
  };
}

function hasData(n: ReturnType<typeof normalize>): boolean {
  return !!(n.zestimate || n.price || n.beds || n.baths || n.sqft);
}
function streetNum(s: string): string {
  const m = (s || "").trim().match(/^\d+/);
  return m ? m[0] : "";
}

// ── Strict address validation ────────────────────────────────────────────────
// Caller demands a HARD match: street #, street name, city, state, ZIP all align.
// We parse out each token from the typed string, normalize both sides, compare.
function parseTyped(addr: string): { num?: string; street?: string; city?: string; state?: string; zip?: string } {
  // Try US patterns like "1476 Cambridge Ave, City, ST 12345"
  const cleaned = addr.replace(/\s+/g, " ").trim();
  // ZIP (5- or 9-digit)
  const zipM = cleaned.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipM?.[1];
  // State (two-letter)
  const stateM = cleaned.match(/\b([A-Z]{2})\b(?=\s*\d{5}|\s*,|$)/i);
  const state = stateM?.[1]?.toUpperCase();
  // Split commas
  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  const streetPart = parts[0] || "";
  const numM = streetPart.match(/^(\d+)\s+(.+)$/);
  const num = numM?.[1];
  const street = numM?.[2]?.trim();
  // City is whatever sits between street and state/zip
  let city: string | undefined;
  if (parts.length >= 3) city = parts[1];                      // "1476 Cambridge Ave, San Diego, CA 92110"
  else if (parts.length === 2) {
    // City might be inside parts[1] before the state
    const rest = parts[1].replace(zip || "", "").replace(state || "", "").trim();
    city = rest.replace(/,?\s*$/, "").trim() || undefined;
  }
  return { num, street, city, state, zip };
}

const norm = (s: string | undefined | null) =>
  (s || "").toString().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
// Strip common suffix variants so "St" matches "Street" etc.
const SUFFIX: Record<string, string> = {
  street: "st", str: "st", st: "st",
  avenue: "ave", av: "ave", ave: "ave",
  drive: "dr", dr: "dr",
  road: "rd", rd: "rd",
  boulevard: "blvd", boulv: "blvd", blvd: "blvd",
  court: "ct", ct: "ct",
  place: "pl", pl: "pl",
  lane: "ln", ln: "ln",
  parkway: "pkwy", pkwy: "pkwy",
  highway: "hwy", hwy: "hwy",
  terrace: "ter", ter: "ter",
  way: "way", circle: "cir", cir: "cir",
};
function normStreet(s: string | undefined): string {
  if (!s) return "";
  return norm(s)
    .split(" ")
    .map((w) => SUFFIX[w] ?? w)
    .join(" ");
}

interface AddressMatch {
  ok: boolean;
  mismatches: string[];          // human-readable list of fields that don't match
}
function strictMatch(typed: string, got: ReturnType<typeof normalize>): AddressMatch {
  const t = parseTyped(typed);
  const gAddrStr = got.address || "";
  const g = parseTyped(gAddrStr);
  const miss: string[] = [];
  if (t.num && g.num && t.num !== g.num) miss.push(`street # (${t.num} ≠ ${g.num})`);
  if (t.street && g.street && normStreet(t.street) !== normStreet(g.street)) miss.push(`street name (${t.street} ≠ ${g.street})`);
  if (t.city && g.city && norm(t.city) !== norm(g.city)) miss.push(`city (${t.city} ≠ ${g.city})`);
  if (t.state && g.state && t.state.toUpperCase() !== g.state.toUpperCase()) miss.push(`state (${t.state} ≠ ${g.state})`);
  if (t.zip && g.zip && t.zip !== g.zip) miss.push(`ZIP (${t.zip} ≠ ${g.zip})`);
  return { ok: miss.length === 0, mismatches: miss };
}

// ── Comparables fetch (best-effort) ──────────────────────────────────────────
// Private-zillow doesn't return comps from /byurl. We approximate by pulling a
// handful of recent listings in the SAME zip via autocomplete, then byurl each.
// Capped to 5 calls so we don't run up the bill.
async function fetchComps(
  zip: string | undefined,
  subject: { sqft?: number; lat?: number; lng?: number; zpid?: string | number },
  key: string,
): Promise<Array<{ price: number; sqft?: number; address?: string }>> {
  if (!zip) return [];
  try {
    const ac = await call(HOST_DATA, `/autocomplete?query=${encodeURIComponent(zip)}`, key);
    const results = ((ac.data as { results?: Array<Record<string, unknown>> })?.results) || [];
    const candidates = results
      .map((r) => (r.metaData as { zpid?: string | number } | undefined)?.zpid)
      .filter((z): z is string | number => !!z && String(z) !== String(subject.zpid))
      .slice(0, 5);
    const comps: Array<{ price: number; sqft?: number; address?: string }> = [];
    for (const z of candidates) {
      try {
        const detailUrl = `https://www.zillow.com/homedetails/${z}_zpid/`;
        const r = await call(HOST_DATA, `/byurl?url=${encodeURIComponent(detailUrl)}`, key);
        if (!r.ok) continue;
        const n = normalize(r.data);
        if (n.price && n.sqft) comps.push({ price: n.price, sqft: n.sqft, address: n.address });
        else if (n.zestimate && n.sqft) comps.push({ price: n.zestimate, sqft: n.sqft, address: n.address });
      } catch { /* skip individual failures */ }
    }
    return comps;
  } catch { return []; }
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

    // STEP 1 — autocomplete. Walk ALL returned candidates (not just the first
    // zpid) and require a STRICT match on street #, name, city, state, ZIP.
    const ac = await call(HOST_DATA, `/autocomplete?query=${encodeURIComponent(address)}`, key);
    attempts.push({ via: "autocomplete", url: `/autocomplete?query=${address}`, status: ac.status });
    const results = ((ac.data as { results?: Array<Record<string, unknown>> })?.results) || [];
    const zpids = results
      .map((r) => (r.metaData as { zpid?: string | number } | undefined)?.zpid)
      .filter((z): z is string | number => !!z);

    if (zpids.length === 0) {
      return json({
        ok: false,
        error: "No Zillow match for that address. Include street #, street name, city, state, and ZIP.",
        ...(debug ? { attempts, acRaw: ac.data } : {}),
      }, 404);
    }

    // STEP 2 — pull each candidate via /byurl, take the FIRST strict match.
    let chosen: { n: ReturnType<typeof normalize>; raw: unknown; match: AddressMatch } | null = null;
    let nearest: { n: ReturnType<typeof normalize>; raw: unknown; match: AddressMatch } | null = null;
    for (const zpid of zpids.slice(0, 5)) {
      const detailUrl = `https://www.zillow.com/homedetails/${zpid}_zpid/`;
      const r = await call(HOST_DATA, `/byurl?url=${encodeURIComponent(detailUrl)}`, key);
      attempts.push({ via: "byurl(zpid)", url: detailUrl, status: r.status });
      if (!r.ok) continue;
      const n = normalize(r.data);
      if (!hasData(n)) continue;
      const m = strictMatch(address, n);
      if (m.ok) { chosen = { n, raw: r.data, match: m }; break; }
      if (!nearest) nearest = { n, raw: r.data, match: m };
    }

    if (!chosen) {
      return json({
        ok: false,
        error: nearest
          ? `Could not find an EXACT match. Closest result mismatches: ${nearest.match.mismatches.join(", ")}. The fetched record will not be used — please correct the address (street #, street, city, state, ZIP).`
          : "Found the address but couldn't load its property details.",
        ...(debug ? { attempts, acRaw: ac.data, nearest: nearest?.n } : {}),
      }, 404);
    }

    // STEP 3 — fetch nearby comps for ARV (best-effort, capped).
    const typedZip = parseTyped(address).zip;
    const comparables = await fetchComps(typedZip, { sqft: chosen.n.sqft, zpid: chosen.n.zpid }, key);

    return finish(chosen.n, address, "address->zpid->byurl", debug ? chosen.raw : undefined, attempts, comparables);
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
  comparables: Array<{ price: number; sqft?: number; address?: string }> = [],
): Response {
  return json({
    ok: true,
    source,
    match: true,
    normalized: { ...n, address: n.address || typedAddress },
    comparables,
    ...(raw !== undefined ? { raw, attempts } : {}),
  });
}
