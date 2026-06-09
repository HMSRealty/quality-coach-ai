// Server-side lead batch import — runs on Cloudflare Pages (Edge Runtime).
// Client sends pre-mapped rows once; server creates every lead and fires
// analyze calls as independent HTTP requests that complete even if the user
// navigates away.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ImportRow {
  cc: string;
  owner: string;
  phone: string;
  address: string;
  asking: string;
  condition: string;
  closing: string;
  reason: string;
  zestimate: string;
  zillow_url: string;
  drive: string;
}

function parseMoneyStr(s: string): number | null {
  if (!s || /^na$/i.test(s.trim()) || s.trim() === "--" || s.trim() === "$--") return null;
  const m = s.replace(/,/g, "").match(/\$?([\d]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, campaignId, userId, orgId } = body as {
      rows: ImportRow[];
      campaignId: string;
      userId: string;
      orgId: string | null;
    };

    if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });
    if (!campaignId || !userId) return NextResponse.json({ error: "campaignId and userId are required" }, { status: 400 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const origin = req.nextUrl.origin;
    const leadIds: Array<{ id: string; driveUrl: string }> = [];
    let skipped = 0;

    // Create every lead row synchronously so we can return accurate counts.
    for (const r of rows) {
      try {
        const askingNum = parseMoneyStr(r.asking);
        const zestimateNum = parseMoneyStr(r.zestimate);

        const { data: lead, error } = await supabase.from("leads").insert({
          user_id: userId,
          organization_id: orgId ?? null,
          campaign_id: campaignId,
          agent_name: r.cc || r.owner || null,
          extracted_address: r.address || null,
          asking_price: askingNum && askingNum > 0 ? askingNum : null,
          status: "Pending",
          metadata: {
            owner_name: r.owner || null,
            cc_name: r.cc || null,
            phone_number: r.phone || null,
            reason: r.reason || null,
            condition: r.condition || null,
            closing: r.closing || null,
            ...(zestimateNum ? { zestimate: zestimateNum } : {}),
            ...(r.zillow_url ? { zillow_link: r.zillow_url } : {}),
            source_audio_url: r.drive || null,
            submitted_via: "csv_import",
          },
        }).select("id").single();

        if (error || !lead?.id) { skipped++; continue; }
        if (r.drive) leadIds.push({ id: lead.id, driveUrl: r.drive });
      } catch { skipped++; }
    }

    // Analyze leads ONE AT A TIME (sequential) so we never hammer Gemini with a
    // whole batch at once — avoids rate-limit/overload and keeps each analysis
    // clean. This runs in the BACKGROUND (waitUntil) so the HTTP response below
    // returns immediately; the client can navigate away while the queue drains.
    // Leads are now "Pending". Kick the sequential queue ONCE — it processes the
    // oldest pending lead, then chains to the next as each finishes (one at a
    // time, no parallel hammering of the AI). Fire-and-forget; it's idempotent.
    fetch(`${origin}/api/leads/process-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      imported: rows.length - skipped,
      analyzing: leadIds.length,
      skipped,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
