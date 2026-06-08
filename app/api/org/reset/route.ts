// app/api/org/reset/route.ts
// OWNER-ONLY hard reset of this account's CRM data. Scoped strictly to the
// caller's own user_id / organization_id — never touches other tenants.
// Requires a typed confirmation ("DELETE") in the body.
//
//   POST  Authorization: Bearer <token>   { "confirm": "DELETE" }
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

const OWNER_ROLES = new Set(["owner", "admin", "user"]); // top-level account holders

export async function POST(req: Request): Promise<Response> {
  try {
    const sb = service();
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { confirm?: string };
    if (body.confirm !== "DELETE") {
      return Response.json({ ok: false, error: 'Type "DELETE" to confirm.' }, { status: 400 });
    }

    // OWNER-ONLY: sub-roles (caller/qa/team_leader/trainer) cannot wipe data.
    const { data: me } = await sb.from("profiles").select("role, organization_id").eq("id", user.id).maybeSingle();
    const role = String(me?.role || "").toLowerCase();
    if (!OWNER_ROLES.has(role)) {
      return Response.json({ ok: false, error: "Only the account owner can reset data." }, { status: 403 });
    }

    const uid = user.id;
    const orgId = (me?.organization_id as string) || null;

    // 1) Remove all recordings from storage for this owner's leads.
    const { data: ups } = await sb.from("call_uploads").select("file_path, bucket").eq("user_id", uid);
    const byBucket = new Map<string, string[]>();
    for (const u of (ups || []) as { file_path: string | null; bucket: string | null }[]) {
      if (!u.file_path) continue;
      const b = u.bucket || "call-recordings";
      (byBucket.get(b) || byBucket.set(b, []).get(b)!).push(u.file_path);
    }
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += 100) {
        try { await sb.storage.from(bucket).remove(paths.slice(i, i + 100)); } catch { /* best-effort */ }
      }
    }

    // 2) Delete CRM rows scoped to this owner. Order respects FKs.
    const counts: Record<string, number | string> = {};
    const wipe = async (table: string, col: string, val: string) => {
      const { count, error } = await sb.from(table).delete({ count: "exact" }).eq(col, val);
      counts[table] = error ? `err: ${error.message}` : (count ?? 0);
    };
    // children first (in case cascade isn't set)
    await wipe("call_uploads", "user_id", uid);
    await wipe("training_snippets", "created_by", uid);
    if (orgId) await wipe("agent_scorecards", "organization_id", orgId);
    await wipe("leads", "user_id", uid);            // cascades lead_events / remaining snippets
    await wipe("cold_callers", "user_id", uid);
    await wipe("campaigns", "user_id", uid);

    return Response.json({ ok: true, counts });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
