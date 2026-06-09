// app/api/public-form/upload/route.ts
// Public (slug-authorized) recording upload for the shared submission form.
// Stores files to the PRIVATE call-recordings bucket and creates call_uploads
// rows, so the lead can be analyzed IN-HOUSE by the sequential queue (the public
// form no longer calls the analyzer directly).
//
//   POST multipart: { slug, leadId, files[] }  ->  { ok, stored }
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const BUCKET = "call-recordings";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) return Response.json({ ok: false, error: "multipart required" }, { status: 400 });

    const sb = service();
    const form = await req.formData();
    const slug = String(form.get("slug") || "").trim();
    const leadId = String(form.get("leadId") || "").trim();
    if (!slug || !leadId) return Response.json({ ok: false, error: "slug and leadId required" }, { status: 400 });

    // Authorize: the slug's form owner must own this lead, and uploads must be allowed.
    const { data: formRow } = await sb.from("submission_forms").select("user_id, is_active").eq("slug", slug).maybeSingle();
    if (!formRow?.is_active) return Response.json({ ok: false, error: "Form not accepting submissions" }, { status: 403 });
    const { data: prof } = await sb.from("profiles").select("allow_call_uploads").eq("id", formRow.user_id).maybeSingle();
    if (!prof?.allow_call_uploads) return Response.json({ ok: false, error: "Uploads not allowed for this form" }, { status: 403 });
    const { data: lead } = await sb.from("leads").select("id, user_id, organization_id").eq("id", leadId).maybeSingle();
    if (!lead || lead.user_id !== formRow.user_id) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });

    const files = [...form.getAll("files"), ...form.getAll("file")].filter((f): f is File => typeof f !== "string");
    if (files.length === 0) return Response.json({ ok: false, error: "No files" }, { status: 400 });

    const orgFolder = (lead.organization_id as string) || (lead.user_id as string) || "org";
    let stored = 0, totalSize = 0;
    for (const f of files) {
      if (f.size > 500 * 1024 * 1024) continue;
      const ext = (f.name.split(".").pop() || "mp3").toLowerCase();
      const path = `${orgFolder}/${leadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, await f.arrayBuffer(), { contentType: f.type || "audio/mpeg", upsert: false });
      if (upErr) continue;
      await sb.from("call_uploads").insert({
        lead_id: leadId, user_id: lead.user_id,
        file_name: f.name, file_path: path, bucket: BUCKET,
        file_size_bytes: f.size, storage_url: null, status: "uploaded",
        uploaded_by: lead.user_id,
      });
      stored++; totalSize += f.size;
    }
    if (stored === 0) return Response.json({ ok: false, error: "All uploads failed" }, { status: 500 });
    await sb.from("leads").update({ audio_size_bytes: totalSize }).eq("id", leadId);

    return Response.json({ ok: true, stored });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
