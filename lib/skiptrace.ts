// Skip-tracing core — shared by the single-lookup and batch API routes.
//
// One place owns: input validation, the provider request (with timeout and
// one retry on transient failures), response normalization, and the paid-plan
// gate. Routes stay thin.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────

export interface TraceInput {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface TraceResult {
  found: boolean;
  matchedName: string;
  primaryPhone: string;
  otherPhones: string[];
  email: string;
  /** Set only when the row failed outright (provider/network error). */
  error?: string;
}

// ── Validation ───────────────────────────────────────────────────────────

/**
 * Normalize one raw payload row into a TraceInput, or explain why not.
 * Two valid shapes:
 *   • name trace    — first + last name, city and state (street optional)
 *   • address trace — street, city and state (no name needed)
 */
export function parseTraceInput(raw: unknown): { ok: true; input: TraceInput } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => String(v ?? "").trim();
  const input: TraceInput = {
    firstName: s(b.firstName),
    lastName: s(b.lastName),
    street: s(b.street),
    city: s(b.city),
    state: s(b.state),
    zip: s(b.zip),
  };
  const hasName = !!(input.firstName && input.lastName);
  const hasAddress = !!input.street;
  if ((!hasName && !hasAddress) || !input.city || !input.state) {
    return { ok: false, error: "Provide an owner name (first + last) or a street address — plus city and state." };
  }
  return { ok: true, input };
}

// ── Auth + paid gate ─────────────────────────────────────────────────────

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Resolve the bearer token to a paid user. Returns the user id, or an error
 * with the right HTTP status. Enforced server-side so the gate can't be
 * bypassed by hitting the API directly.
 */
export async function requirePaidUser(
  req: Request,
  sb: SupabaseClient,
): Promise<{ userId: string } | { error: string; status: number }> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Unauthorized", status: 401 };

  const { data: u } = await sb.auth.getUser(token);
  const user = u?.user;
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await sb
    .from("profiles")
    .select("is_approved, payment_status, plan_tier")
    .eq("id", user.id)
    .maybeSingle();

  const paid =
    profile?.is_approved === true &&
    (profile?.payment_status === "paid" || (profile?.plan_tier && profile.plan_tier !== "free"));
  if (!paid) return { error: "Skip tracing is a paid feature. Upgrade your plan to activate it.", status: 402 };

  return { userId: user.id };
}

// ── Provider key ─────────────────────────────────────────────────────────

export async function readProviderKey(): Promise<string> {
  if (process.env.RAPIDAPI_KEY) return process.env.RAPIDAPI_KEY;
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const env = (getRequestContext().env as Record<string, string | undefined>) || {};
    if (env.RAPIDAPI_KEY) return env.RAPIDAPI_KEY;
  } catch {
    /* not running on Pages — fall through */
  }
  return "";
}

// ── Provider call ────────────────────────────────────────────────────────

const PROVIDER_HOST = "skip-tracing-working-api.p.rapidapi.com";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 800;

/** fetch with a hard timeout and one retry on 429/5xx/network blips. */
async function providerFetch(url: string, apiKey: string): Promise<Response | null> {
  const headers = { "x-rapidapi-host": PROVIDER_HOST, "x-rapidapi-key": apiKey };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (res.ok) return res;
      // Retry only transient statuses; 4xx (except 429) won't improve.
      if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return res;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return null;
    }
  }
  return null;
}

const NO_MATCH: Omit<TraceResult, "error"> = {
  found: false, matchedName: "", primaryPhone: "", otherPhones: [], email: "",
};

/**
 * Run one skip trace: search by name+address (or address alone when no name
 * was given), then pull person details.
 */
export async function traceOne(input: TraceInput, apiKey: string): Promise<TraceResult> {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const cityStateZip = `${input.city} ${input.state} ${input.zip}`.trim();

  let url: string;
  if (fullName && input.lastName) {
    url = `https://${PROVIDER_HOST}/search/bynameaddress?name=${encodeURIComponent(fullName)}&citystatezip=${encodeURIComponent(cityStateZip)}&page=1`;
    if (input.street) url += `&street=${encodeURIComponent(input.street)}`;
  } else {
    // Address-only trace — resolves the current owner/resident at the address.
    url = `https://${PROVIDER_HOST}/search/byaddress?street=${encodeURIComponent(input.street)}&citystatezip=${encodeURIComponent(cityStateZip)}&page=1`;
  }

  const searchRes = await providerFetch(url, apiKey);
  if (!searchRes) return { ...NO_MATCH, error: "Lookup timed out — try again." };
  if (!searchRes.ok) return { ...NO_MATCH, error: `Lookup failed (${searchRes.status})` };

  const searchJson = (await searchRes.json().catch(() => null)) as { PeopleDetails?: Array<Record<string, string>> } | null;
  const first = searchJson?.PeopleDetails?.[0];
  if (!first) return { ...NO_MATCH, matchedName: fullName };

  const personId = first["Person ID"];
  const matchedName = first.Name || fullName;
  const phones: string[] = [];
  let email = "";

  if (personId) {
    const detailsRes = await providerFetch(
      `https://${PROVIDER_HOST}/search/detailsbyID?peo_id=${encodeURIComponent(personId)}`,
      apiKey,
    );
    if (detailsRes?.ok) {
      const details = (await detailsRes.json().catch(() => null)) as {
        "Person Details"?: Array<{ Telephone?: string }>;
        "All Phone Details"?: Array<string | Record<string, string>>;
        "Email Addresses"?: Array<string | Record<string, string>>;
      } | null;
      const primary = details?.["Person Details"]?.[0]?.Telephone?.trim();
      if (primary) phones.push(primary);
      for (const p of details?.["All Phone Details"] || []) {
        const ps = (typeof p === "string" ? p : p["Phone Number"] || p.Phone || p.Telephone)?.trim();
        if (ps && !phones.includes(ps)) phones.push(ps);
      }
      const emails = details?.["Email Addresses"];
      if (emails?.length) {
        email = emails
          .map((e) => (typeof e === "string" ? e : e.Email || e.email || ""))
          .filter(Boolean)
          .join(", ");
      }
    }
  }

  return {
    found: phones.length > 0,
    matchedName,
    primaryPhone: phones[0] || "",
    otherPhones: phones.slice(1, 4),
    email,
  };
}

/** Run many traces with bounded concurrency, preserving input order. */
export async function traceMany(inputs: TraceInput[], apiKey: string, concurrency = 4): Promise<TraceResult[]> {
  const results: TraceResult[] = new Array(inputs.length);
  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const i = next++;
      results[i] = await traceOne(inputs[i], apiKey);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
  return results;
}

/** Best-effort audit logging — never blocks or throws. */
export async function logTraces(
  sb: SupabaseClient,
  userId: string,
  rows: Array<{ input: TraceInput; result: TraceResult }>,
): Promise<void> {
  if (!rows.length) return;
  try {
    await sb.from("propytrace_lookups").insert(
      rows.map(({ input, result }) => ({
        user_id: userId,
        name: `${input.firstName} ${input.lastName}`.trim(),
        address: [input.street, input.city, input.state, input.zip].filter(Boolean).join(", "),
        matched_name: result.matchedName || null,
        primary_phone: result.primaryPhone || null,
        found: result.found,
      })),
    );
  } catch {
    /* audit is best-effort */
  }
}
