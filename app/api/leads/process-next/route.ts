// Sequential lead-analysis queue — STRICTLY one lead at a time, per user.
//
// Idempotent "tick": safe to call repeatedly (the client monitor calls it as a
// heartbeat; the chain calls it after each lead). Each tick:
//   0. WATCHDOG — any lead stuck in "Processing" longer than STALE_MS (hung or a
//      dropped background chain) is reset to "Queued" so the queue never jams.
//   1. If a FRESH lead is already Processing → return (it owns the slot).
//   2. Claim the oldest "Queued" lead (Queued→Processing). A post-claim guard
//      releases it if a race produced two Processing leads.
//   3. Run analyze (bounded by its own timeouts), then trigger the next tick.
//
//   POST  { userId }
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const STALE_MS = 6 * 60 * 1000; // a lead Processing longer than this is considered stuck

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function runInBackground(p: Promise<unknown>) {
  try {
    const { getRequestContext } = await import("@cloudflare/next-on-pages");
    getRequestContext().ctx.waitUntil(p);
  } catch { void p; }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const sb = service();
    const origin = req.nextUrl.origin;

    // 0) WATCHDOG — release leads stuck in Processing (hung analyze / dropped chain).
    const staleCut = new Date(Date.now() - STALE_MS).toISOString();
    await sb.from("leads").update({ status: "Queued" })
      .eq("user_id", userId).eq("status", "Processing").lt("updated_at", staleCut);

    // 1) A FRESH lead still in flight? Leave it — strict single concurrency.
    const { data: active } = await sb.from("leads")
      .select("id, created_at")
      .eq("user_id", userId).eq("status", "Processing")
      .order("created_at", { ascending: true });
    if ((active?.length ?? 0) > 0) return NextResponse.json({ ok: true, busy: true });

    // 2) Oldest Queued lead.
    const { data: queued } = await sb.from("leads")
      .select("id, metadata, created_at")
      .eq("user_id", userId).eq("status", "Queued")
      .order("created_at", { ascending: true }).limit(1);
    const target = (queued || [])[0] as { id: string; metadata: Record<string, unknown> | null; created_at: string } | undefined;
    if (!target) return NextResponse.json({ ok: true, done: true });

    // 3) Claim (Queued → Processing); guard ensures only one survives a race.
    const { data: claimed } = await sb.from("leads")
      .update({ status: "Processing" })
      .eq("id", target.id).eq("status", "Queued")
      .select("id").maybeSingle();
    if (!claimed) return NextResponse.json({ ok: true, raced: true });

    const { data: proc } = await sb.from("leads")
      .select("id, created_at")
      .eq("user_id", userId).eq("status", "Processing")
      .order("created_at", { ascending: true });
    if ((proc?.length ?? 0) > 1 && proc && proc[0].id !== target.id) {
      // Someone older is already processing — yield this one back to the queue.
      await sb.from("leads").update({ status: "Queued" }).eq("id", target.id).eq("status", "Processing");
      return NextResponse.json({ ok: true, raced: true });
    }

    const driveLink = target.metadata && typeof target.metadata.source_audio_url === "string" ? target.metadata.source_audio_url : null;

    // 4) Analyze this one (bounded by analyze's internal timeouts), then tick again.
    const work = (async () => {
      try {
        await fetch(`${origin}/api/leads/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: target.id, ...(driveLink ? { audioUrls: [driveLink] } : {}) }),
        });
      } catch { /* analyze flips the lead to a final status itself; continue */ }
      try {
        await fetch(`${origin}/api/leads/process-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      } catch { /* the client heartbeat will resume it */ }
    })();
    await runInBackground(work);

    return NextResponse.json({ ok: true, started: target.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
