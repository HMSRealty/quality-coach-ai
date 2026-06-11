// Health check — Supabase, Gemini, and storage. Returns 200 only if everything
// passes. Useful for uptime monitors (Better Uptime, Pingdom, UptimeRobot etc.).
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface Check { name: string; ok: boolean; ms: number; detail?: string }

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; result?: T; detail?: string }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { ok: true, ms: Date.now() - t0, result };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(): Promise<Response> {
  const checks: Check[] = [];

  // 1) Supabase reachable + readable
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
  const supabaseCheck = await timed(async () => {
    const { error } = await sb.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw new Error(error.message);
    return true;
  });
  checks.push({ name: "supabase", ok: supabaseCheck.ok, ms: supabaseCheck.ms, detail: supabaseCheck.detail });

  // 2) Storage bucket reachable
  const storageCheck = await timed(async () => {
    const { error } = await sb.storage.from("call-recordings").list("", { limit: 1 });
    if (error) throw new Error(error.message);
    return true;
  });
  checks.push({ name: "storage", ok: storageCheck.ok, ms: storageCheck.ms, detail: storageCheck.detail });

  // 3) Gemini API key present (don't actually call to avoid costs)
  checks.push({
    name: "gemini_key",
    ok: !!process.env.GEMINI_API_KEY,
    ms: 0,
    detail: process.env.GEMINI_API_KEY ? undefined : "GEMINI_API_KEY not set",
  });

  // 4) Readymode encryption key present
  checks.push({
    name: "encryption_key",
    ok: !!process.env.READYMODE_ENC_KEY,
    ms: 0,
    detail: process.env.READYMODE_ENC_KEY ? undefined : "READYMODE_ENC_KEY not set (per-tenant Readymode creds disabled)",
  });

  // 5) Sentry DSN present (informational — not required for service health)
  checks.push({
    name: "sentry_dsn",
    ok: true,   // never fail the overall check on this
    ms: 0,
    detail: process.env.SENTRY_DSN ? undefined : "SENTRY_DSN not set (errors not reported)",
  });

  const allOk = checks.every((c) => c.ok);
  return Response.json({
    ok: allOk,
    timestamp: new Date().toISOString(),
    checks,
  }, { status: allOk ? 200 : 503 });
}
