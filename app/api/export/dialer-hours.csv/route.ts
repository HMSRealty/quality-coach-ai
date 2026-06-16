// CSV export of every dialer_hours snapshot synced from Readymode.
//
//   =IMPORTDATA("https://realtrack.app/api/export/dialer-hours.csv?key=rt_live_...")
//
// One row per (agent, period). Minutes columns are output as decimal hours so
// Sheets can SUM them directly into payroll formulas.

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

interface HoursRow {
  id: string;
  agent_name: string;
  agent_email: string | null;
  period_from: string;
  period_to: string;
  shift_start: string | null;
  shift_end: string | null;
  logged_minutes: number;
  payable_minutes: number;
  ready_minutes: number;
  break_minutes: number;
  lunch_minutes: number;
  afk_minutes: number;
  assigned_user_id: string | null;
  synced_at: string;
  profiles?: { email: string | null; full_name: string | null } | null;
}

const toH = (m: number | null | undefined): number => (m ? Math.round((m / 60) * 100) / 100 : 0);

export async function GET(req: Request) {
  const sb = service();
  const userId = await resolveApiKey(sb as never, req);
  if (!userId) {
    return new Response("Missing or invalid API key. Add ?key=rt_live_... to the URL.", { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 5000), 10000);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  let q = sb.from("dialer_hours")
    .select("id, agent_name, agent_email, period_from, period_to, shift_start, shift_end, logged_minutes, payable_minutes, ready_minutes, break_minutes, lunch_minutes, afk_minutes, assigned_user_id, synced_at")
    .eq("user_id", userId)
    .order("period_from", { ascending: false })
    .order("agent_name", { ascending: true })
    .limit(limit);
  if (from) q = q.gte("period_from", from);
  if (to) q = q.lte("period_to", to);

  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });
  const rows = (data || []) as unknown as HoursRow[];

  // Resolve assigned_user_id → email (one extra query, keeps the CSV readable).
  const assignedIds = [...new Set(rows.map((r) => r.assigned_user_id).filter(Boolean))] as string[];
  const emailById = new Map<string, string>();
  if (assignedIds.length) {
    const { data: profiles } = await sb.from("profiles")
      .select("id, email, full_name").in("id", assignedIds);
    for (const p of (profiles || [])) {
      emailById.set(p.id as string, ((p.full_name as string) || (p.email as string) || ""));
    }
  }

  const headers = [
    "Period From", "Period To",
    "Agent (Readymode)", "Email",
    "Assigned RealTrack User",
    "Shift Start", "Shift End",
    "Logged (h)", "Payable (h)", "Ready (h)", "Break (h)", "Lunch (h)", "AFK (h)",
    "Synced At", "Row ID",
  ];

  const out = rows.map((r) => [
    r.period_from, r.period_to,
    r.agent_name, r.agent_email ?? "",
    r.assigned_user_id ? (emailById.get(r.assigned_user_id) || "") : "",
    r.shift_start ?? "", r.shift_end ?? "",
    toH(r.logged_minutes), toH(r.payable_minutes), toH(r.ready_minutes),
    toH(r.break_minutes), toH(r.lunch_minutes), toH(r.afk_minutes),
    r.synced_at, r.id,
  ]);

  return csvResponse(headers, out, "realtrack-dialer-hours.csv");
}
