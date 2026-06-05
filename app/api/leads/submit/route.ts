// app/api/leads/submit/route.ts
// Multi-tenant lead intake pipeline: property enrichment -> ARV -> insert.
// Additive: not yet wired into the UI. Works once the CRM migrations are applied
// (needs leads.organization_id / stage / market_value / arv columns).
//
//   POST { orgId, createdBy, ownerName, ownerPhone, address, askingPrice, condition }
//
// Secrets are ENV-only. Property vendor is abstracted (services/propertyDataProvider).
import { createClient } from "@supabase/supabase-js";
import {
  lookupProperty,
  type PropertyCache,
  type PropertyLookupResult,
} from "@/services/propertyDataProvider";
import { calculateArv, type Condition } from "@/services/arv";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Shared property cache backed by the service-role client (RLS-exempt table).
function dbCache(sb: ReturnType<typeof service>): PropertyCache {
  return {
    async get(hash) {
      const { data } = await sb
        .from("property_data_cache")
        .select("normalized")
        .eq("address_hash", hash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      return data ? (data.normalized as PropertyLookupResult) : null;
    },
    async set(hash, value) {
      await sb.from("property_data_cache").upsert({
        address_hash: hash,
        provider: value.provider,
        normalized: value,
      });
    },
  };
}

interface Body {
  orgId?: string;
  createdBy?: string;
  ownerName?: string;
  ownerPhone?: string;
  address?: string;
  askingPrice?: number | string;
  condition?: Condition;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const sb = service();
    const b = (await req.json().catch(() => ({}))) as Body;
    if (!b.orgId) return Response.json({ ok: false, error: "orgId required" }, { status: 400 });

    // --- Enrichment + ARV (server-side; vendor abstracted) ---
    let market_value: number | undefined;
    let arv: number | null = null;
    let arv_confidence = 0;

    if (b.address) {
      const result = await lookupProperty(b.address, dbCache(sb));
      market_value = result.property?.marketValue;
      const out = calculateArv({
        subjectSqft: result.property?.sqft,
        comparables: result.comparables,
        condition: b.condition,
        zipMultiplier: 1.0, // TODO: zip-level market table
      });
      arv = out.estimatedArv;
      arv_confidence = out.confidence;
    }

    const asking =
      typeof b.askingPrice === "string" ? parseFloat(b.askingPrice) : b.askingPrice ?? null;

    // --- Insert (trigger stamps EST submission_date + 'created' timeline event) ---
    const { data, error } = await sb
      .from("leads")
      .insert({
        organization_id: b.orgId,
        created_by: b.createdBy ?? null,
        assigned_to: b.createdBy ?? null,
        owner_name: b.ownerName ?? null,
        owner_phone: b.ownerPhone ?? null,
        property_address: b.address ?? null,
        asking_price: asking != null && isFinite(asking as number) ? asking : null,
        market_value,
        arv,
        arv_confidence,
        status: "processing",
        stage: "new",
      })
      .select("id")
      .single();

    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

    // Hand off to the existing QA analysis route here if desired.
    return Response.json({ ok: true, leadId: data.id, arv, arv_confidence });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
