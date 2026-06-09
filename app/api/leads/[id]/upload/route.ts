// app/api/leads/[id]/upload/route.ts
// Server-side recording upload for internal users. Browser uploads to the
// 'call-uploads' bucket hit storage RLS (path must match auth.uid()), which
// breaks when an internal user adds a recording to a lead they don't own.
// This route uses the SERVICE ROLE — bypassing storage RLS — then inserts the
// call_uploads rows, flips the lead to Processing, and returns the public URLs
// so the client can fire /api/leads/analyze with the full list.
//
//   POST /api/leads/{id}/upload   (multipart: files[])   Bearer token optional
//     -> { ok, urls: string[] }
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ ok: false, error: "multipart/form-data required" }, { status: 400 });
    }

    const sb = service();

    // ── AUTH + TENANCY ── service role bypasses RLS; verify the caller and that
    // they share the lead's org before letting them attach billable recordings.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: me } = await sb.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();

    // Confirm the lead exists + get the owner (path namespace + DB ownership).
    const { data: lead, error: leadErr } = await sb
      .from("leads").select("id, user_id, organization_id").eq("id", id).maybeSingle();
    if (leadErr || !lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });

    const sameOrg = lead.organization_id && me?.organization_id && lead.organization_id === me.organization_id;
    const ownsLegacy = lead.user_id && lead.user_id === user.id;
    if (!sameOrg && !ownsLegacy) return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const uploaderId: string = user.id;

    const form = await req.formData();
    const files = [...form.getAll("files"), ...form.getAll("file")].filter((f): f is File => typeof f !== "string");
    if (files.length === 0) return Response.json({ ok: false, error: "No files provided" }, { status: 400 });

    // Upload to the PRIVATE call-recordings bucket. Return short-lived signed
    // URLs (1h) so the analyzer can fetch them — no public URL is ever created.
    const BUCKET = "call-recordings";
    const orgFolder = lead.organization_id || lead.user_id || uploaderId || "org";
    const signedUrls: string[] = [];
    let totalSize = 0;
    for (const f of files) {
      if (f.size > 500 * 1024 * 1024) continue;
      const ext = (f.name.split(".").pop() || "mp3").toLowerCase();
      const path = `${orgFolder}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const bytes = await f.arrayBuffer();
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
        contentType: f.type || "audio/mpeg",
        upsert: false,
      });
      if (upErr) continue;
      const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (signed?.signedUrl) signedUrls.push(signed.signedUrl);
      totalSize += f.size;
      await sb.from("call_uploads").insert({
        lead_id: id, user_id: lead.user_id,
        file_name: f.name, file_path: path, bucket: BUCKET,
        file_size_bytes: f.size, storage_url: null, status: "uploaded",
        uploaded_by: uploaderId,
      });
    }

    if (signedUrls.length === 0) {
      return Response.json({ ok: false, error: "All uploads failed (is the call-recordings bucket created?)" }, { status: 500 });
    }

    // NOTE: we deliberately do NOT flip status here. The caller decides what
    // happens next (the submit flow enqueues via /api/leads/[id]/queue; the
    // lead-detail page fires analyze directly). Avoids a false "Processing" that
    // would block the sequential queue.
    await sb.from("leads").update({ audio_size_bytes: totalSize }).eq("id", id);

    return Response.json({ ok: true, urls: signedUrls });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
