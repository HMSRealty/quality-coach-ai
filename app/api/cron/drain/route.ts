// app/api/cron/drain/route.ts
// Always-on queue driver. A scheduled trigger (Cloudflare Cron Worker or any
// external cron) hits this every minute; it finds every user that still has
// Queued or stuck-Processing leads and kicks the sequential worker for each, so
// the queue keeps draining even when nobody has a dashboard tab open.
//
// Secured by CRON_SECRET (header `Authorization: Bearer <secret>` or `?key=`).
//   GET|POST /api/cron/drain
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
  } catch { void p; }
}

async function handle(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET || "";
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const key = req.nextUrl.searchParams.get("key") || "";
  if (secret && auth !== secret && key !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sb = service();
  const origin = req.nextUrl.origin;

  // Distinct owners with work still pending (Queued) or in flight (Processing —
  // process-next will reset it if stale).
  const { data } = await sb.from("leads")
    .select("user_id, status")
    .in("status", ["Queued", "Processing"])
    .limit(5000);

  const userIds = [...new Set((data || []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean) as string[])];

  // Kick each owner's worker once; the worker processes one lead inline and then
  // chains to the next. Run in the background so the cron call returns fast.
  await runInBackground(Promise.all(userIds.map((uid) =>
    fetch(`${origin}/api/leads/process-next`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid }),
    }).catch(() => {}),
  )));

  return NextResponse.json({ ok: true, drained: userIds.length });
}

export const GET = handle;
export const POST = handle;
