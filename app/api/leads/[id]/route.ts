// app/api/leads/[id]/route.ts
// DELETE a lead (owner or same-org), cleaning up its recordings first.
// Service role so it works regardless of RLS, but tenancy is checked explicitly.
//
//   DELETE /api/leads/{id}   Authorization: Bearer <token>
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const sb = service();

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: lead } = await sb.from("leads").select("id, user_id, organization_id").eq("id", id).maybeSingle();
    if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });

    const { data: me } = await sb.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const sameOrg = lead.organization_id && me?.organization_id && lead.organization_id === me.organization_id;
    const owns = lead.user_id && lead.user_id === user.id;
    if (!owns && !sameOrg) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // Best-effort: remove the lead's recordings from storage, then their rows.
    const { data: recs } = await sb.from("call_uploads").select("file_path, bucket").eq("lead_id", id);
    for (const r of (recs || []) as { file_path: string | null; bucket: string | null }[]) {
      if (r.file_path) { try { await sb.storage.from(r.bucket || "call-recordings").remove([r.file_path]); } catch { /* ignore */ } }
    }
    await sb.from("call_uploads").delete().eq("lead_id", id);
    await sb.from("training_snippets").delete().eq("lead_id", id).then(() => {}, () => {});
    await sb.from("lead_events").delete().eq("lead_id", id).then(() => {}, () => {});

    const { error: delErr } = await sb.from("leads").delete().eq("id", id);
    if (delErr) return Response.json({ ok: false, error: delErr.message }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
