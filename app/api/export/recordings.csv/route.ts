// CSV export of every lead that has a call recording attached, with a
// playable URL per row. Designed for Sheets:
//
//   =IMPORTDATA("https://realtrack.app/api/export/recordings.csv?key=rt_live_...")
//
// The URL is the workspace-scoped /api/leads/:id/recording endpoint which
// re-streams the file (works for both private Drive recordings and public
// "anyone with the link" files).

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
  agent_name: string | null;
  call_recording_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  campaigns?: { name: string } | null;
}

export async function GET(req: Request) {
  const sb = service();
  const userId = await resolveApiKey(sb as never, req);
  if (!userId) {
    return new Response("Missing or invalid API key. Add ?key=rt_live_... to the URL.", { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 5000), 10000);
  const origin = url.origin;

  const { data, error } = await sb.from("leads")
    .select("id, status, extracted_address, agent_name, call_recording_url, metadata, created_at, campaigns(name)")
    .eq("user_id", userId)
    .neq("status", "Processing")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return new Response(error.message, { status: 500 });

  const headers = [
    "Date", "Status", "Campaign", "Agent",
    "Address",
    "Recording (play in RealTrack)", "Source URL",
    "Lead ID",
  ];

  const rows = (data || []) as unknown as LeadRow[];
  const out = rows
    .filter((l) => {
      const m = (l.metadata || {}) as Record<string, unknown>;
      return !!(l.call_recording_url || m.source_audio_url);
    })
    .map((l) => {
      const m = (l.metadata || {}) as Record<string, unknown>;
      const source = l.call_recording_url || (m.source_audio_url as string) || "";
      return [
        new Date(l.created_at).toISOString(),
        l.status,
        l.campaigns?.name ?? "",
        l.agent_name ?? "",
        l.extracted_address ?? "",
        `${origin}/dashboard/leads/${l.id}`,
        source,
        l.id,
      ];
    });

  return csvResponse(headers, out, "realtrack-recordings.csv");
}
