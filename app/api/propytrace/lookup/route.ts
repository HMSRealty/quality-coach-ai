export const runtime = "edge";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Single-shot skip trace. Caller supplies a name + address; we return the
// best phone + matched name + email. Paid-status is enforced server-side
// against the profile so a curious user can't bypass the gate by hitting
// the API directly.

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readRapidApiKey(): Promise<string> {
  if (process.env.RAPIDAPI_KEY) return process.env.RAPIDAPI_KEY;
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    const env = (getRequestContext().env as any) || {};
    if (env.RAPIDAPI_KEY) return env.RAPIDAPI_KEY;
  } catch {}
  return "";
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sb = admin();
    const { data: u } = await sb.auth.getUser(token);
    const user = u?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await sb
      .from("profiles")
      .select("is_approved, payment_status, plan_tier")
      .eq("id", user.id)
      .maybeSingle();

    const paid = profile?.is_approved === true && (profile?.payment_status === "paid" || (profile?.plan_tier && profile.plan_tier !== "free"));
    if (!paid) return NextResponse.json({ error: "PropyTrace lookups are a paid feature. Upgrade your plan or visit propytrace.app." }, { status: 402 });

    const body = await req.json().catch(() => ({}));
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const street = String(body.street || "").trim();
    const city = String(body.city || "").trim();
    const state = String(body.state || "").trim();
    const zip = String(body.zip || "").trim();

    if (!firstName || !lastName || !city || !state) {
      return NextResponse.json({ error: "First name, last name, city and state are required." }, { status: 400 });
    }

    const apiKey = await readRapidApiKey();
    if (!apiKey) return NextResponse.json({ error: "Skip-trace provider not configured." }, { status: 503 });

    const fullName = `${firstName} ${lastName}`.trim();
    const cityStateZip = `${city} ${state} ${zip}`.trim();
    let url = `https://skip-tracing-working-api.p.rapidapi.com/search/bynameaddress?name=${encodeURIComponent(fullName)}&citystatezip=${encodeURIComponent(cityStateZip)}&page=1`;
    if (street) url += `&street=${encodeURIComponent(street)}`;

    const headers = {
      "x-rapidapi-host": "skip-tracing-working-api.p.rapidapi.com",
      "x-rapidapi-key": apiKey,
    };

    const searchRes = await fetch(url, { method: "GET", headers });
    if (!searchRes.ok) return NextResponse.json({ error: `Provider error (${searchRes.status})` }, { status: 502 });
    const searchJson: any = await searchRes.json();

    const first = searchJson?.PeopleDetails?.[0];
    if (!first) return NextResponse.json({ ok: true, found: false });

    const personId = first["Person ID"];
    const matchedName = first.Name || fullName;

    const phones: string[] = [];
    let email = "";

    if (personId) {
      const detailsRes = await fetch(
        `https://skip-tracing-working-api.p.rapidapi.com/search/detailsbyID?peo_id=${encodeURIComponent(personId)}`,
        { method: "GET", headers },
      );
      if (detailsRes.ok) {
        const profile: any = await detailsRes.json();
        const primary = profile?.["Person Details"]?.[0]?.Telephone?.trim();
        if (primary) phones.push(primary);
        for (const p of profile?.["All Phone Details"] || []) {
          const ps = (typeof p === "string" ? p : (p["Phone Number"] || p.Phone || p.Telephone))?.trim();
          if (ps && !phones.includes(ps)) phones.push(ps);
        }
        const emails = profile?.["Email Addresses"];
        if (emails?.length) {
          email = emails.map((e: any) => typeof e === "string" ? e : (e.Email || e.email || "")).filter(Boolean).join(", ");
        }
      }
    }

    // Log the lookup for billing / audit (best-effort, do not block on errors).
    sb.from("propytrace_lookups").insert({
      user_id: user.id,
      name: fullName,
      address: [street, city, state, zip].filter(Boolean).join(", "),
      matched_name: matchedName,
      primary_phone: phones[0] || null,
      found: phones.length > 0,
    }).then(() => {}, () => {});

    return NextResponse.json({
      ok: true,
      found: phones.length > 0,
      matchedName,
      primaryPhone: phones[0] || "",
      otherPhones: phones.slice(1, 4),
      email,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Lookup failed" }, { status: 500 });
  }
}
