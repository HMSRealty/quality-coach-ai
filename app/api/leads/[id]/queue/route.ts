// app/api/leads/[id]/queue/route.ts
// Enqueue a single lead for ORDERED, one-at-a-time backend analysis. Every intake
// path (internal form, public form, inbound webhook) calls this instead of hitting
// the analyzer directly — so a burst of simultaneous submissions never hammers the
// AI. The lead is marked "Queued" (FIFO by created_at) and the sequential worker is
// kicked. Safe under high concurrency: the worker enforces single-concurrency.
//
//   POST /api/leads/{id}/queue  ->  { ok }
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = service();

    const { data: lead } = await sb.from("leads").select("id, user_id, status").eq("id", id).single();
    if (!lead) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 });

    // Don't re-queue something already mid-flight or finished as Queued/Processing.
    const st = String(lead.status || "").toLowerCase();
    if (st !== "queued" && st !== "processing") {
      await sb.from("leads").update({ status: "Queued" }).eq("id", id);
    }

    // Kick the sequential worker (idempotent — returns busy if one is running).
    fetch(`${req.nextUrl.origin}/api/leads/process-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: lead.user_id }),
    }).catch(() => {});

    return NextResponse.json({ ok: true, queued: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
