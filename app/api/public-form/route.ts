// app/api/public-form/route.ts
// Public, UNAUTHENTICATED endpoint for the shared submission form.
// Uses the Supabase service-role key server-side so it works for ANYONE with
// the link — no login, no client-side RLS on profiles/callers/campaigns needed.
//
//   GET  /api/public-form?slug=acme-123abc
//        → { ok, form: { form_name, allow_call_uploads, user_id, form_id },
//            callers: [{id,name}], campaigns: [{id,name}] }   (or { ok:false, blocked })
//   POST /api/public-form
//        body: { slug, lead: {...} }  → inserts the lead, returns { ok, leadId }

import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Resolve a slug → the owning form + profile flags. Returns a blocked reason
// (string) when the form should not accept submissions.
async function resolveOwner(sb: ReturnType<typeof service>, slug: string) {
  const { data: form } = await sb
    .from("submission_forms")
    .select("id, user_id, name, is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (!form) return { blocked: "This form does not exist." as const };
  if (!form.is_active) return { blocked: "This form is currently not accepting submissions." as const };

  const { data: profile } = await sb
    .from("profiles")
    .select("can_receive_leads, allow_call_uploads")
    .eq("id", form.user_id)
    .maybeSingle();

  if (!profile?.can_receive_leads) {
    return { blocked: "This form is currently not accepting submissions." as const };
  }

  return {
    form: {
      form_id: form.id,
      user_id: form.user_id,
      form_name: form.name || "Submit a Lead",
      allow_call_uploads: !!profile.allow_call_uploads,
    },
  };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const sb = service();
    const slug = (new URL(req.url).searchParams.get("slug") || "").trim();
    if (!slug) return json({ ok: false, error: "slug required" }, 400);

    const resolved = await resolveOwner(sb, slug);
    if ("blocked" in resolved) return json({ ok: false, blocked: resolved.blocked });

    const { form } = resolved;
    const [{ data: callers }, { data: campaigns }] = await Promise.all([
      sb.from("cold_callers").select("id, name").eq("user_id", form.user_id).order("name"),
      sb.from("campaigns").select("id, name").eq("user_id", form.user_id).order("name"),
    ]);

    return json({ ok: true, form, callers: callers || [], campaigns: campaigns || [] });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

type LeadBody = {
  caller_id?: string;
  campaign_id?: string;
  date?: string;
  owner_name?: string;
  phone_number?: string;
  property_address?: string;
  zestimate?: string;
  zillow_link?: string;
  asking_price?: string;
  reason?: string;
  zillow_data?: Record<string, unknown> | null;
  arv?: number | null;
  arv_confidence?: number | null;
  additional_properties?: Array<Record<string, unknown>>;
  call_link?: string | null;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const sb = service();
    const body = await req.json().catch(() => ({})) as { slug?: string; lead?: LeadBody };
    const slug = (body.slug || "").trim();
    const lead = body.lead || {};
    if (!slug) return json({ ok: false, error: "slug required" }, 400);

    // Re-resolve the owner server-side — never trust a user_id from the client.
    const resolved = await resolveOwner(sb, slug);
    if ("blocked" in resolved) return json({ ok: false, error: resolved.blocked }, 403);
    const { form } = resolved;

    // Resolve caller name from id (within this owner) for display.
    let agent_name: string | null = null;
    if (lead.caller_id) {
      const { data: caller } = await sb
        .from("cold_callers")
        .select("name")
        .eq("id", lead.caller_id)
        .eq("user_id", form.user_id)
        .maybeSingle();
      agent_name = caller?.name || null;
    }

    const askingNum = lead.asking_price ? parseFloat(lead.asking_price) : null;

    const { data: inserted, error: insertError } = await sb
      .from("leads")
      .insert({
        user_id: form.user_id,
        submission_form_id: form.form_id,
        campaign_id: lead.campaign_id || null,
        caller_id: lead.caller_id || null,
        agent_name,
        extracted_address: lead.property_address || null,
        asking_price: askingNum != null && isFinite(askingNum) ? askingNum : null,
        status: "Pending",
        metadata: {
          date: lead.date,
          owner_name: lead.owner_name,
          phone_number: lead.phone_number,
          zestimate: lead.zestimate,
          zillow_link: lead.zillow_link,
          reason: lead.reason,
          zillow_data: lead.zillow_data || null,
          arv: lead.arv ?? null,
          arv_confidence: lead.arv_confidence ?? null,
          additional_properties: Array.isArray(lead.additional_properties) ? lead.additional_properties : [],
          ...(lead.call_link && String(lead.call_link).trim() ? { source_audio_url: String(lead.call_link).trim() } : {}),
          submitted_via: "public_form",
        },
      })
      .select("id")
      .single();

    if (insertError) return json({ ok: false, error: insertError.message }, 500);
    if (!inserted) return json({ ok: false, error: "Insert failed" }, 500);

    return json({ ok: true, leadId: inserted.id, user_id: form.user_id, allow_call_uploads: form.allow_call_uploads });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}
