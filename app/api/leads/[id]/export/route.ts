// app/api/leads/[id]/export/route.ts
// Export a lead as a JSON payload to an external webhook (Zapier / GHL / Make).
// Webhook URL is org-scoped (organizations.export_webhook_url) so users set it
// once. Endpoint accepts an override URL for ad-hoc testing.
//
//   POST /api/leads/{id}/export       { url?: string }   (optional override)
//     → 200 { ok, status }            on successful relay
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

interface Body { url?: string }

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Body;

    const sb = service();
    const { data: lead, error } = await sb
      .from("leads")
      .select("*, campaigns(name)")
      .eq("id", id)
      .maybeSingle();
    if (error || !lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });

    // Pick the destination URL: explicit override > org's saved URL.
    let url = body.url?.trim();
    if (!url && lead.organization_id) {
      const { data: org } = await sb
        .from("organizations").select("export_webhook_url").eq("id", lead.organization_id).maybeSingle();
      if (org?.export_webhook_url) url = (org.export_webhook_url as string).trim();
    }
    if (!url) return Response.json({ ok: false, error: "No webhook URL configured. Save one in Settings or pass {url}." }, { status: 400 });

    // Mint a short-lived signed URL for the latest call recording (if any),
    // so the receiver can pull audio without a Supabase token.
    let signedCallUrl: string | null = null;
    const { data: latestCall } = await sb
      .from("calls").select("storage_path")
      .eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestCall?.storage_path) {
      const { data: s } = await sb.storage.from("call-recordings").createSignedUrl(latestCall.storage_path, 60 * 60);
      signedCallUrl = s?.signedUrl ?? null;
    }
    if (!signedCallUrl && lead.call_recording_url) signedCallUrl = lead.call_recording_url;

    const md = (lead.metadata || {}) as Record<string, unknown>;
    const zillow = (md.zillow_data as Record<string, unknown> | undefined) || {};

    const payload = {
      source: "RealTrack",
      lead: {
        id: lead.id,
        created_at: lead.created_at,
        status: lead.status,
        stage: lead.stage,
        owner_name: md.owner_name ?? null,
        owner_phone: md.phone_number ?? null,
        property_address: lead.extracted_address,
        agent_name: lead.agent_name,
        campaign: (lead as { campaigns?: { name: string } | null }).campaigns?.name ?? null,
        asking_price: lead.asking_price,
        zillow: {
          zestimate: zillow.zestimate ?? null,
          beds: zillow.beds ?? null,
          baths: zillow.baths ?? null,
          sqft: zillow.sqft ?? null,
          link: zillow.zillow_url ?? md.zillow_link ?? null,
        },
        arv: md.arv ?? null,
        rehab_cost_estimate: md.rehab_cost_estimate ?? 0,
        primary_objection: md.primary_objection ?? null,
        seller_personality: md.seller_personality ?? null,
        seller_pain_point: md.seller_pain_point ?? null,
        seller_bottom_line: md.seller_bottom_line ?? null,
        ai_summary: md.call_summary ?? null,
        ai_feedback: lead.ai_feedback,
        ai_coaching_points: lead.ai_coaching_points,
        bant: {
          budget: lead.bant_budget, authority: lead.bant_authority,
          need: lead.bant_need, timeline: lead.bant_timeline,
        },
        call_recording_url: signedCallUrl,
      },
    };

    // Forward to the webhook.
    let upstreamStatus = 0;
    let upstreamBody = "";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "RealTrack/1.0" },
        body: JSON.stringify(payload),
      });
      upstreamStatus = r.status;
      upstreamBody = (await r.text()).slice(0, 500);
    } catch (e) {
      return Response.json({ ok: false, error: e instanceof Error ? e.message : "Webhook failed" }, { status: 502 });
    }

    // Flag the export in metadata so the UI can show it.
    await sb.from("leads").update({
      metadata: { ...md, exported_at: new Date().toISOString(), exported_to: url },
    }).eq("id", id);

    return Response.json({ ok: upstreamStatus >= 200 && upstreamStatus < 300, status: upstreamStatus, body: upstreamBody });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
