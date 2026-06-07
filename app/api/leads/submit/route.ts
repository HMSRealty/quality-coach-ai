// app/api/leads/submit/route.ts
// Authenticated lead intake. Inserts a lead for the signed-in user, then lets
// the client kick /api/leads/analyze.
//
// SMART DUPLICATE BYPASS:
//   If a lead with the same normalized address already exists for this user:
//     • status was "Disqualified" or "Error"  -> revive it (reset to Processing,
//       overwrite the fields, merge metadata) and allow re-analysis.
//     • any other status                      -> blocked as a duplicate (409).
//
//   POST (Bearer auth) {
//     campaignId, callerId, agentName, address, askingPrice,
//     ownerName, phone, reason, zillowLink, zestimate, metadata?
//   }
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

const REVIVE_STATUSES = new Set(["disqualified", "error"]);
const norm = (s: string) =>
  (s || "").trim().toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ");

interface Body {
  campaignId?: string;
  callerId?: string | null;
  agentName?: string | null;
  address?: string;
  askingPrice?: number | string | null;
  ownerName?: string | null;
  phone?: string | null;
  reason?: string | null;
  zillowLink?: string | null;
  zestimate?: string | null;
  metadata?: Record<string, unknown>;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });

    const sb = service();
    const { data: auth } = await sb.auth.getUser(token);
    const user = auth?.user;
    if (!user) return Response.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const b = (await req.json().catch(() => ({}))) as Body;
    const address = (b.address || "").trim();
    if (!address) return Response.json({ ok: false, error: "Property address is required" }, { status: 400 });
    if (!b.campaignId) return Response.json({ ok: false, error: "Campaign is required" }, { status: 400 });

    const asking =
      typeof b.askingPrice === "string" ? parseFloat(b.askingPrice) : b.askingPrice ?? null;
    const askingClean = asking != null && isFinite(asking as number) ? (asking as number) : null;

    const metadata = {
      date: new Date().toISOString().split("T")[0],
      owner_name: b.ownerName ?? "",
      phone_number: b.phone ?? "",
      zestimate: b.zestimate ?? "",
      zillow_link: b.zillowLink ?? "",
      reason: b.reason ?? "",
      submitted_via: "internal_form",
      ...(b.metadata || {}),
    };

    // ── Duplicate detection (same user, same normalized address) ──
    const { data: candidates } = await sb
      .from("leads")
      .select("id, status, extracted_address, metadata")
      .eq("user_id", user.id)
      .ilike("extracted_address", `%${address.slice(0, 60)}%`)
      .limit(20);

    const match = (candidates || []).find(
      (c) => norm(c.extracted_address || "") === norm(address),
    );

    if (match) {
      const prev = (match.status || "").toLowerCase();
      if (!REVIVE_STATUSES.has(prev)) {
        // Genuine duplicate — block.
        return Response.json(
          { ok: false, duplicate: true, leadId: match.id, status: match.status,
            error: `This address already exists (status: ${match.status}).` },
          { status: 409 },
        );
      }
      // Revive a Disqualified/Error lead: overwrite + merge metadata, re-queue.
      const mergedMeta = { ...(match.metadata as Record<string, unknown> || {}), ...metadata, revived_from: match.status };
      const { error: upErr } = await sb
        .from("leads")
        .update({
          campaign_id: b.campaignId,
          caller_id: b.callerId ?? null,
          agent_name: b.agentName ?? null,
          extracted_address: address,
          asking_price: askingClean,
          status: "Processing",
          metadata: mergedMeta,
        })
        .eq("id", match.id);
      if (upErr) return Response.json({ ok: false, error: upErr.message }, { status: 500 });
      return Response.json({ ok: true, leadId: match.id, mode: "revived", previousStatus: match.status });
    }

    // ── New lead ──
    const { data: inserted, error } = await sb
      .from("leads")
      .insert({
        user_id: user.id,
        campaign_id: b.campaignId,
        caller_id: b.callerId ?? null,
        agent_name: b.agentName ?? null,
        extracted_address: address,
        asking_price: askingClean,
        status: "Processing",
        metadata,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      return Response.json({ ok: false, error: error?.message || "Insert failed" }, { status: 500 });
    }
    return Response.json({ ok: true, leadId: inserted.id, mode: "new" });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}
