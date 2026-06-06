// services/arvCast.ts
// ARV provider backed by ARVCast (RapidAPI). Vendor isolated behind a single
// function so the analyze/submit pipeline doesn't depend on a specific vendor.
// Key comes from ENV only — never hardcoded.
//   ARVCAST_RAPIDAPI_KEY  (preferred) – falls back to RAPIDAPI_KEY if unset.

const HOST = "arvcast.p.rapidapi.com";

export interface ArvCastResult {
  arv: number | null;            // ARV in USD
  confidence: number;            // 0..1 — coarse rating from the vendor or 0.7 default
  city?: string;
  address?: string;
  raw?: unknown;
  source: "arvcast";
}

function keyOrThrow(): string {
  const k = process.env.ARVCAST_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
  if (!k) throw new Error("ARVCAST_RAPIDAPI_KEY (or RAPIDAPI_KEY) is not set");
  return k;
}

// Walk a JSON payload for the first plausible ARV number.
function deepFindArv(node: unknown): number | null {
  let found: number | null = null;
  const visit = (n: unknown) => {
    if (found != null || !n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (found != null) return;
      const kl = k.toLowerCase();
      if ((kl === "arv" || kl === "estimated_arv" || kl === "estimatedarv" || kl === "afterrepairvalue" || kl === "after_repair_value")
          && (typeof v === "number" || (typeof v === "string" && /^\$?[\d,.]+$/.test(v)))) {
        const n = Number(String(v).replace(/[^0-9.]/g, ""));
        if (isFinite(n) && n > 0) { found = n; return; }
      }
      visit(v);
    }
  };
  visit(node);
  return found;
}
function deepFindConfidence(node: unknown): number | null {
  let found: number | null = null;
  const visit = (n: unknown) => {
    if (found != null || !n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (found != null) return;
      const kl = k.toLowerCase();
      if (kl === "confidence" || kl === "confidence_score" || kl === "score") {
        const n = Number(String(v).replace(/[^0-9.]/g, ""));
        if (isFinite(n) && n >= 0) {
          // Normalize: vendor may return 0..1 or 0..100.
          found = n > 1 ? Math.min(1, n / 100) : n;
          return;
        }
      }
      visit(v);
    }
  };
  visit(node);
  return found;
}

/**
 * Hit ARVCast's /subject endpoint with the property's city + street address.
 * Returns { arv, confidence } or { arv: null } if the vendor can't price it.
 *
 *   GET https://arvcast.p.rapidapi.com/api/v1/subject?city=…&address=…
 */
export async function fetchArvCast(args: { city: string; address: string }): Promise<ArvCastResult> {
  const key = keyOrThrow();
  const url = new URL(`https://${HOST}/api/v1/subject`);
  url.searchParams.set("city", args.city);
  url.searchParams.set("address", args.address);

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": HOST,
      "Content-Type": "application/json",
    },
  });
  const text = await r.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`ARVCast ${r.status}: ${text.slice(0, 200)}`);

  const arv = deepFindArv(data);
  const confidence = deepFindConfidence(data) ?? (arv ? 0.7 : 0);

  return {
    arv,
    confidence,
    city: args.city,
    address: args.address,
    raw: data,
    source: "arvcast",
  };
}

// Try to split a typed address string into a (city, street) pair the vendor wants.
//   "6128 Raintree Dr, Memphis, TN 38119" → { city: "Memphis", address: "6128 Raintree Dr" }
//   "6128 Raintree Dr Memphis TN 38119"   → best-effort by stripping ZIP/state.
export function splitAddressForArvCast(full: string, fallbackCity?: string): { city: string; address: string } | null {
  if (!full) return null;
  const cleaned = full.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const address = parts[0];
    // City is usually parts[1]; if parts[1] looks like "City ST 12345" trim trailing tokens.
    const cityRaw = parts[1].replace(/\b[A-Z]{2}\b/i, "").replace(/\b\d{5}(?:-\d{4})?\b/, "").trim();
    if (address && cityRaw) return { city: cityRaw, address };
  }
  if (fallbackCity) return { city: fallbackCity, address: parts[0] || cleaned };
  return null;
}
