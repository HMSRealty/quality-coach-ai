// app/api/recordings/[id]/url/route.ts
// Mint a short-lived SIGNED URL for a call_uploads recording in the PRIVATE
// 'call-recordings' bucket. Org-gated + download-gated. No public URLs ever.
//
//   GET /api/recordings/{callUploadId}/url?mode=play|download   (Bearer token)
import { createClient } from "@supabase/supabase-js";
import { can, normalizeRole } from "@/lib/rbac";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const mode = new URL(req.url).searchParams.get("mode") === "download" ? "download" : "play";

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sb = service();
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { data: me } = await sb
      .from("profiles")
      .select("role, organization_id, can_download_calls, parent_user_id")
      .eq("id", user.id).maybeSingle();
    const role = normalizeRole(me?.role);

    // Recording → its lead → org. Verify tenancy.
    const { data: rec } = await sb
      .from("call_uploads")
      .select("file_path, bucket, storage_url, lead_id")
      .eq("id", id).maybeSingle();
    if (!rec) return Response.json({ error: "Not found" }, { status: 404 });

    const { data: lead } = await sb
      .from("leads").select("organization_id, user_id").eq("id", rec.lead_id).maybeSingle();
    const sameOrg = lead?.organization_id && me?.organization_id && lead.organization_id === me.organization_id;
    const ownsLegacy = lead?.user_id && lead.user_id === user.id;
    if (!sameOrg && !ownsLegacy) return Response.json({ error: "Forbidden" }, { status: 404 });

    if (!can(role, "calls.play")) return Response.json({ error: "Forbidden" }, { status: 403 });

    // Download gate: role permission + per-sub-user override.
    const downloadOff = me?.parent_user_id != null && me?.can_download_calls === false;
    if (mode === "download" && (!can(role, "calls.download") || downloadOff)) {
      return Response.json({ error: "Download disabled for your account" }, { status: 403 });
    }

    const bucket = (rec.bucket as string) || "call-recordings";
    const path = rec.file_path as string;
    if (!path) {
      // Legacy row with only a public URL — return it (older uploads).
      return Response.json({ url: rec.storage_url, mode, legacy: true });
    }
    const { data: signed, error: signErr } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, mode === "download" ? 300 : 180, mode === "download" ? { download: true } : undefined);
    if (signErr || !signed) return Response.json({ error: "Could not sign URL" }, { status: 500 });

    return Response.json({ url: signed.signedUrl, mode });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
