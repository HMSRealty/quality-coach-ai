// CSV export of every lead in the workspace, auth via the same api_key used
// for the inbound webhook. Designed to be pulled live by Google Sheets:
//
//   =IMPORTDATA("https://realtrack.app/api/export/leads.csv?key=rt_live_...")
//
// One row per lead. Includes all the fields a closer would want at a glance:
// status, address, asking, ARV, MAO estimate, agent, campaign, reason, dates.

import { createClient } from "@supabase/supabase-js";
import { csvResponse, resolveApiKey } from "@/lib/csv";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface LeadRow {
  id: string;
  status: string;
  extracted_address: string | null;
  asking_price: number | null;
  qualification_reason: string | null;
  agent_name: string | null;
  call_recording_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  const sb = service();
  const userId = await resolveApiKey(sb as never, req);
  if (!userId) {
    return new Response("Missing or invalid API key. Add ?key=rt_live_... to the URL.", { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 5000), 10000);

  const { data, error } = await sb.from("leads")
    .select("id, status, extracted_address, asking_price, qualification_reason, agent_name, call_recording_url, metadata, created_at, campaigns(name)")
    .eq("user_id", userId)
    .neq("status", "Processing")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return new Response(error.message, { status: 500 });

  const rows = (data || []) as unknown as LeadRow[];

  const headers = [
    "Date", "Status", "Campaign", "Agent",
    "Address", "Owner", "Phone",
    "Asking Price", "Zestimate", "ARV", "Est. MAO",
    "Recording URL",
    "Reason", "Lead ID",
  ];

  const out = rows.map((l) => {
    const m = (l.metadata || {}) as Record<string, unknown>;
    const zillow = (m.zillow_data || {}) as Record<string, unknown>;
    const arv = num(m.arv) ?? num(zillow.zestimate);
    const mao = arv ? Math.round(arv * 0.7 - 10000) : null;
    return [
      new Date(l.created_at).toISOString(),
      l.status,
      l.campaigns?.name ?? "",
      l.agent_name ?? "",
      l.extracted_address ?? "",
      (m.owner_name as string) ?? "",
      (m.phone as string) ?? "",
      l.asking_price ?? "",
      num(zillow.zestimate) ?? "",
      arv ?? "",
      mao ?? "",
      l.call_recording_url ?? (m.source_audio_url as string) ?? "",
      l.qualification_reason ?? "",
      l.id,
    ];
  });

  return csvResponse(headers, out, "realtrack-leads.csv");
}
