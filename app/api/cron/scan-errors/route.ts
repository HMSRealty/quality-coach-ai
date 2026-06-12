// Random error-lead re-scanner. Every minute the cron picks N random leads
// currently in "Error" status (across all tenants) and re-queues them for
// analysis. Errors are most often transient (Gemini overload, network blip,
// stuck pipeline) — a quiet retry recovers them without operator action.
//
// Auth: same CRON_SECRET as the other cron endpoints.
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// How many to re-queue per minute. Conservative so we don't blow through
// the Gemini cap on a flood of legitimately-broken leads. The throttle cycle
// (4.5 min run / 2 min pause) is the primary safety belt.
const MAX_PER_RUN = 5;

// Don't keep retrying forever — leads that have errored this many times in
// the past 7 days are skipped (the next attempt won't help).
const MAX_RETRIES = 3;

// Only look back this far. Older errors are abandoned.
const LOOKBACK_HOURS = 24;

export async function POST(req: Request): Promise<Response> {
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected || auth !== expected) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // Pull a candidate pool larger than MAX_PER_RUN so we can randomize.
  const { data: candidates } = await sb
    .from("leads")
    .select("id, user_id, metadata, updated_at")
    .eq("status", "Error")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(MAX_PER_RUN * 6);

  if (!candidates || candidates.length === 0) {
    return Response.json({ ok: true, scanned: 0, requeued: 0 });
  }

  // Filter out leads that have already exceeded MAX_RETRIES.
  const eligible = candidates.filter((l) => {
    const retryCount = ((l.metadata as Record<string, unknown> | null)?.retry_count as number) || 0;
    return retryCount < MAX_RETRIES;
  });

  // Randomize the selection so we don't keep hitting the same N leads.
  const picked = [...eligible].sort(() => Math.random() - 0.5).slice(0, MAX_PER_RUN);

  let requeued = 0;
  for (const lead of picked) {
    const meta = (lead.metadata || {}) as Record<string, unknown>;
    const nextCount = ((meta.retry_count as number) || 0) + 1;
    const { error } = await sb.from("leads").update({
      status: "Queued",
      metadata: {
        ...meta,
        retry_count: nextCount,
        last_auto_retry_at: new Date().toISOString(),
      },
    }).eq("id", lead.id).eq("status", "Error");  // double-check status to avoid races
    if (!error) requeued++;
  }

  // Trigger the queue drain so the new Queued leads start processing.
  if (requeued > 0) {
    const origin = new URL(req.url).origin;
    await fetch(`${origin}/api/cron/drain`, {
      method: "POST",
      headers: { Authorization: `Bearer ${expected}` },
    }).catch(() => {});
  }

  return Response.json({ ok: true, scanned: eligible.length, requeued });
}
