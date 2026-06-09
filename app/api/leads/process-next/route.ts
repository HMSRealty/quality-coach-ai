// Sequential lead-analysis queue.
//
// Leads are imported/submitted with status "Pending". This endpoint processes
// them ONE AT A TIME for a given user:
//   1. If a lead is already "Processing" for the user → do nothing (something is
//      already running; it will trigger the next one when it finishes).
//   2. Otherwise pick the oldest "Pending" lead that actually HAS a recording
//      (Drive link / call_recording_url / an uploaded file), flip it to
//      "Processing", run analyze, then re-trigger this endpoint to take the next.
//
// The chain is self-perpetuating: each completion kicks off the next lead, so
// the whole queue drains strictly sequentially without ever hammering the AI.
//
//   POST  { userId }   (no auth header needed — service-role, scoped by userId)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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
  } catch {
    void p;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const sb = service();
    const origin = req.nextUrl.origin;

    // 1) Already a lead in flight? Then nothing to do — it owns the chain.
    const { count: busy } = await sb.from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "Processing");
    if ((busy ?? 0) > 0) return NextResponse.json({ ok: true, busy: true });

    // 2) Find the oldest QUEUED lead (user pressed Start) that has a recording.
    //    "Pending" leads are idle imports the user hasn't started yet.
    const { data: pending } = await sb.from("leads")
      .select("id, call_recording_url, metadata, created_at")
      .eq("user_id", userId).eq("status", "Queued")
      .order("created_at", { ascending: true })
      .limit(50);

    const target = ((pending || [])[0] as { id: string; call_recording_url: string | null; metadata: Record<string, unknown> | null } | undefined) || null;
    if (!target) return NextResponse.json({ ok: true, done: true });

    // 3) Claim it (Queued → Processing). The eq("status","Queued") guard makes
    //    this a best-effort atomic claim against a racing trigger.
    const { data: claimed } = await sb.from("leads")
      .update({ status: "Processing" })
      .eq("id", target.id).eq("status", "Queued")
      .select("id").maybeSingle();
    if (!claimed) return NextResponse.json({ ok: true, raced: true });

    const driveLink = target.metadata && typeof target.metadata.source_audio_url === "string" ? target.metadata.source_audio_url : null;

    // 4) Analyze this one, then trigger the next. Runs in the background so the
    //    response returns immediately.
    const work = (async () => {
      try {
        await fetch(`${origin}/api/leads/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: target!.id, ...(driveLink ? { audioUrls: [driveLink] } : {}) }),
        });
      } catch { /* analyze flips the lead to Error itself; continue the chain */ }
      // Hand off to the next Pending lead.
      try {
        await fetch(`${origin}/api/leads/process-next`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      } catch { /* best-effort */ }
    })();
    await runInBackground(work);

    return NextResponse.json({ ok: true, started: target.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
