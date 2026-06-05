// app/api/calls/[id]/url/route.ts
// Mints a short-lived SIGNED URL for a private call recording and enforces the
// play-vs-download rule that RLS cannot (both modes need the same object):
//   • calls.play     → stream URL  (Caller, Team Leader, Trainer, QA, Admin, Owner)
//   • calls.download → attachment  (QA, Admin, Owner only)
// Additive: works once the CRM migrations + private 'call-recordings' bucket exist.
//
//   GET /api/calls/:id/url?mode=play|download   (Bearer token in Authorization)
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
      .from("profiles").select("role, organization_id").eq("id", user.id).maybeSingle();
    const role = normalizeRole(me?.role);

    // Fetch the call + enforce tenant isolation.
    const { data: call } = await sb
      .from("calls").select("storage_path, organization_id").eq("id", id).maybeSingle();
    if (!call || call.organization_id !== me?.organization_id) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Permission gate.
    if (!can(role, "calls.play")) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (mode === "download" && !can(role, "calls.download")) {
      return Response.json({ error: "Download not permitted for your role" }, { status: 403 });
    }

    const { data: signed, error: signErr } = await sb.storage
      .from("call-recordings")
      .createSignedUrl(
        call.storage_path,
        mode === "download" ? 300 : 120,                         // short-lived
        mode === "download" ? { download: true } : undefined,    // attachment disposition
      );
    if (signErr || !signed) return Response.json({ error: "Could not sign URL" }, { status: 500 });

    return Response.json({ url: signed.signedUrl, mode });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
