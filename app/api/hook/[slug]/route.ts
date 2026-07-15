// Per-user dialer webhook.  POST /api/hook/{slug}
//
// Each user gets their own endpoint + secret, so a leaked key is revocable in
// isolation and every event is attributable to the workspace that received it.
//
// This route does THREE things and nothing else:
//   1. authenticate the endpoint
//   2. append the payload verbatim to ingest_events
//   3. enqueue a job and return 200
//
// It deliberately does NOT fetch recordings, call Gemini, or resolve
// campaigns.  The legacy /api/inbound/lead did all of that inline — it
// downloaded up to 500MB of audio and logged into Readymode before
// responding, on an edge runtime with a ~30s wall-clock budget.  The git
// history is a run of timeout fixes because of it.  A dialer that times out
// retries and duplicates; a dialer that gets a fast 200 does not.
//
// Everything slow happens in the analytics worker, driven by the job queue.
//
//   POST /api/hook/ab12cd34ef
//   Authorization: Bearer <secret>        (or ?secret= for dialers that
//                                          cannot set custom headers)
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time compare over the hex digests. A plain === on secrets leaks
// length and prefix through timing; cheap to avoid, so avoid it.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Readymode posts JSON today (verified against 120 live payloads), but has
// historically been configured to send form-encoded bodies too. Parse both,
// and NEVER reject on a shape we don't recognise — store it raw and let the
// worker decide. A rejected webhook is a call we can never recover.
function parseBody(raw: string, contentType: string): Record<string, unknown> {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json") || raw.trimStart().startsWith("{")) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* fall through — keep the raw text below */
    }
  }
  try {
    const params = new URLSearchParams(raw);
    const out: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) out[k] = v;
    if (Object.keys(out).length > 0) return out;
  } catch {
    /* fall through */
  }
  return { _unparsed: raw };
}

// A stable natural key for the event, used to make redelivery idempotent.
// Readymode sends no call id and no timestamp, so we synthesise one from the
// fields it DOES send. This is a mitigation for a feed that gives us nothing
// better — not a substitute for a real id. If the dialer ever starts sending
// one, prefer it.
async function dedupeKey(body: Record<string, unknown>): Promise<string | null> {
  const explicit =
    body.call_id ?? body.callId ?? body.recording_id ?? body.recordingId ?? body.connection_id;
  if (explicit) return `id:${String(explicit)}`;

  const phone = String(body.phone ?? "").replace(/\D/g, "");
  const agent = String(body.agent_name ?? body.agent ?? "").trim().toLowerCase();
  if (!phone && !agent) return null;

  // Bucket to the minute: a genuine redelivery lands in the same bucket, while
  // a real second call to the same person minutes later does not — which is
  // exactly the distinction the legacy 409-on-duplicate-address rule got
  // wrong when it discarded every repeat call outright.
  const minute = Math.floor(Date.now() / 60000);
  return `syn:${await sha256hex(`${phone}|${agent}|${minute}`)}`;
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.pathname.split("/").filter(Boolean).pop() || "";

  try {
    const sb = service();

    const { data: endpoint } = await sb
      .from("webhook_endpoints")
      .select("id, organization_id, secret_hash, is_active, provider")
      .eq("slug", slug)
      .maybeSingle();

    // Same response for unknown slug and bad secret — don't confirm which
    // endpoints exist to someone probing.
    const deny = () =>
      Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    if (!endpoint || !endpoint.is_active) return deny();

    const presented = (
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("secret") ||
      req.headers.get("x-webhook-secret") ||
      ""
    ).trim();
    if (!presented) return deny();
    if (!timingSafeEqual(await sha256hex(presented), String(endpoint.secret_hash))) return deny();

    const rawText = await req.text().catch(() => "");
    const contentType = req.headers.get("content-type") || "";
    const body = parseBody(rawText, contentType);

    const headers: Record<string, string> = {};
    for (const [k, v] of req.headers.entries()) {
      // Never persist the caller's credential into the event log.
      if (k.toLowerCase() === "authorization" || k.toLowerCase() === "x-webhook-secret") continue;
      headers[k] = v;
    }

    const key = await dedupeKey(body);

    const { data: event, error } = await sb
      .from("ingest_events")
      .insert({
        organization_id: endpoint.organization_id,
        endpoint_id: endpoint.id,
        source: `${endpoint.provider}_webhook`,
        kind: "lead_submitted",
        payload: body,
        headers,
        dedupe_key: key,
      })
      .select("id")
      .single();

    // Unique violation on dedupe_key = redelivery of something we already
    // hold. That is success from the dialer's point of view: 200, or it
    // retries forever.
    if (error) {
      if (error.code === "23505") {
        return Response.json({ ok: true, duplicate: true });
      }
      throw new Error(error.message);
    }

    // Hand off to the worker. Recording fetch, transcription, analysis, and
    // rollups all happen there.
    await sb.from("jobs").insert({
      organization_id: endpoint.organization_id,
      kind: "process_ingest_event",
      payload: { ingest_event_id: event.id },
    });

    // last_seen_at / events_received are maintained by the
    // trg_ingest_touch_endpoint trigger on ingest_events. Doing it here meant
    // either an extra awaited round trip in the hot path, or a fire-and-forget
    // that the edge runtime cancels the moment we return — which is what it
    // did: after a successful POST, last_seen_at was still null.

    return Response.json({ ok: true, event_id: event.id });
  } catch (e) {
    try {
      const { reportError } = await import("@/lib/sentry");
      await reportError(e, { route: "/api/hook/[slug]" });
    } catch {
      /* never break on telemetry failure */
    }
    // 500 so the dialer retries — this is our fault, not theirs, and the
    // event is worth more than a tidy log.
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Server error" },
      { status: 500 },
    );
  }
}

// Readymode's UI lets an operator verify an endpoint with a GET before saving
// it. Answer without requiring the secret: it reveals only that a slug exists,
// and a dialer that can't verify is a dialer that gets misconfigured.
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const slug = url.pathname.split("/").filter(Boolean).pop() || "";
  try {
    const sb = service();
    const { data } = await sb
      .from("webhook_endpoints")
      .select("is_active")
      .eq("slug", slug)
      .maybeSingle();
    if (!data || !data.is_active) {
      return Response.json({ ok: false, error: "Unknown endpoint" }, { status: 404 });
    }
    return Response.json({ ok: true, message: "Endpoint is live. POST your call data here." });
  } catch {
    return Response.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
