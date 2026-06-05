// services/propertyDataProvider.ts
// ---------------------------------------------------------------------------
// Vendor-agnostic property data access. The rest of the app NEVER talks to a
// specific vendor (Zillow, ATTOM, etc.) directly — it depends on this interface.
// Swap providers with the PROPERTY_PROVIDER env var. Providers read their OWN
// key from env placeholders; no secret is ever hardcoded here.
//
//   PROPERTY_PROVIDER = "mock" | "rapidapi-zillow"
//   RAPIDAPI_KEY      = <set as a deployment secret, never in code>
// ---------------------------------------------------------------------------

export interface NormalizedProperty {
  address: string;
  marketValue?: number;   // provider estimate (e.g. Zestimate)
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  homeType?: string;
  lat?: number;
  lng?: number;
  imageUrl?: string;
  sourceUrl?: string;
  providerId?: string;    // vendor id (zpid, attomId, …)
}

export interface Comparable {
  price: number;
  sqft?: number;
  distanceMiles?: number;
  soldAt?: string;        // ISO date
}

export interface PropertyLookupResult {
  provider: string;
  property: NormalizedProperty | null;
  comparables: Comparable[];
}

export interface PropertyDataProvider {
  readonly name: string;
  lookup(address: string): Promise<PropertyLookupResult>;
}

// Optional cache backend (decoupled from Supabase so the provider stays testable).
export interface PropertyCache {
  get(addressHash: string): Promise<PropertyLookupResult | null>;
  set(addressHash: string, value: PropertyLookupResult): Promise<void>;
}

// ----------------------------------------------------------------- helpers
export function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ");
}

// Web-Crypto sha256 → hex (works on Edge + Node 20+).
export async function addressHash(addr: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeAddress(addr));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function deepFindZpid(node: unknown): string | null {
  let found: string | null = null;
  const visit = (n: unknown) => {
    if (found || !n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(visit);
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (found) return;
      if (k.toLowerCase() === "zpid" && v != null && /^\d{4,}$/.test(String(v))) { found = String(v); return; }
      visit(v);
    }
  };
  visit(node);
  return found;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : undefined;
}

// ----------------------------------------------------------- MOCK provider
// Deterministic, no network. Default in dev/test so the pipeline always runs.
class MockPropertyDataProvider implements PropertyDataProvider {
  readonly name = "mock";
  async lookup(address: string): Promise<PropertyLookupResult> {
    const seed = [...address].reduce((a, c) => a + c.charCodeAt(0), 0);
    const sqft = 1200 + (seed % 1600);
    const ppsf = 120 + (seed % 180);
    const marketValue = Math.round(sqft * ppsf);
    const comparables: Comparable[] = Array.from({ length: 5 }, (_, i) => ({
      price: Math.round(marketValue * (0.9 + ((seed + i) % 20) / 100)),
      sqft: sqft + (((seed + i) % 300) - 150),
      distanceMiles: 0.2 + ((seed + i) % 8) / 10,
    }));
    return {
      provider: this.name,
      property: {
        address, marketValue, sqft,
        beds: 2 + (seed % 4), baths: 1 + (seed % 3), yearBuilt: 1950 + (seed % 70),
      },
      comparables,
    };
  }
}

// ------------------------------------------------ RapidAPI Zillow provider
// Wraps the resolve(address→zpid) → byurl flow already proven in /api/zillow.
class RapidApiZillowProvider implements PropertyDataProvider {
  readonly name = "rapidapi-zillow";
  private host = "private-zillow.p.rapidapi.com";
  constructor(private key: string = process.env.RAPIDAPI_KEY ?? "") {}

  private async call(path: string): Promise<unknown> {
    const r = await fetch(`https://${this.host}${path}`, {
      headers: { "x-rapidapi-key": this.key, "x-rapidapi-host": this.host },
    });
    if (!r.ok) throw new Error(`property provider ${r.status}`);
    return r.json();
  }

  async lookup(address: string): Promise<PropertyLookupResult> {
    if (!this.key) throw new Error("RAPIDAPI_KEY not configured");
    const ac = await this.call(`/autocomplete?query=${encodeURIComponent(address)}`);
    const zpid = deepFindZpid(ac);
    if (!zpid) return { provider: this.name, property: null, comparables: [] };

    const detailUrl = `https://www.zillow.com/homedetails/${zpid}_zpid/`;
    const d = (await this.call(`/byurl?url=${encodeURIComponent(detailUrl)}`)) as Record<string, unknown>;
    const a = (d.PropertyAddress ?? {}) as Record<string, unknown>;
    const property: NormalizedProperty = {
      address: [a.streetAddress, a.city, a.state, a.zipcode].filter(Boolean).join(", ") || address,
      marketValue: num(d.zestimate),
      price: num(d.Price),
      beds: num(d.Bedrooms),
      baths: num(d.Bathrooms),
      sqft: num(d["Area(sqft)"]),
      yearBuilt: num(d.yearBuilt),
      sourceUrl: typeof d.PropertyZillowURL === "string" ? d.PropertyZillowURL : undefined,
      providerId: String(d.PropertyZPID ?? zpid),
    };
    // This vendor endpoint returns no comps; ARV will fall back to its low-confidence path.
    return { provider: this.name, property, comparables: [] };
  }
}

// --------------------------------------------------------------- factory
export function getPropertyDataProvider(): PropertyDataProvider {
  switch ((process.env.PROPERTY_PROVIDER || "mock").toLowerCase()) {
    case "rapidapi-zillow": return new RapidApiZillowProvider();
    default:                return new MockPropertyDataProvider();
  }
}

// Cache-through lookup: pass a PropertyCache (e.g. backed by property_data_cache
// via the service-role client) to avoid re-billing the vendor for repeat addresses.
export async function lookupProperty(address: string, cache?: PropertyCache): Promise<PropertyLookupResult> {
  const key = await addressHash(address);
  if (cache) {
    const hit = await cache.get(key);
    if (hit) return hit;
  }
  const result = await getPropertyDataProvider().lookup(address);
  if (cache && result.property) await cache.set(key, result);
  return result;
}
