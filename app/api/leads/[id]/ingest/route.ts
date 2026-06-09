// app/api/leads/[id]/ingest/route.ts
// Pull a lead's Google Drive recording INTO our own storage ONCE, so the AI can
// analyze it in-house and we never depend on Drive at analysis time. Idempotent:
// if the lead already has an in-house recording, it's a no-op.
//
//   POST /api/leads/{id}/ingest  ->  { ok, already?:true, ingested?:true }
import { createClient } from "@supabase/supabase-js";
import { getDriveAccessToken, driveFileId } from "@/lib/googleDrive";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DOWNLOAD_TIMEOUT_MS = 90_000;
const BUCKET = "call-recordings";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function tfetch(input: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try { return await fetch(input, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

// Download a recording: PRIVATE Drive via the owner's token, PUBLIC Drive via
// usercontent, or a plain direct URL. Returns null if not retrievable.
async function downloadRecording(driveToken: string | null, url: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const id = driveFileId(url);
  if (id && driveToken) {
    try {
      const r = await tfetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${driveToken}` } });
      if (r.ok) { const bytes = await r.arrayBuffer(); const ct = r.headers.get("content-type") || ""; return { bytes, mime: ct.includes("audio") || ct.includes("video") || ct.includes("mp4") ? ct : "audio/mpeg" }; }
    } catch { /* fall through */ }
  }
  if (id) {
    try {
      let resp = await tfetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
      let ct = resp.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        const html = await resp.text();
        const tok = html.match(/name="confirm"\s+value="([^"]+)"/) || html.match(/confirm=([0-9A-Za-z_-]+)/);
        const uuid = html.match(/name="uuid"\s+value="([^"]+)"/);
        if (tok) { resp = await tfetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=${tok[1]}${uuid ? `&uuid=${uuid[1]}` : ""}`); ct = resp.headers.get("content-type") || ""; }
      }
      if (!resp.ok || ct.includes("text/html")) return null;
      const bytes = await resp.arrayBuffer();
      return { bytes, mime: ct.includes("audio") || ct.includes("video") || ct.includes("mp4") ? ct : "audio/mpeg" };
    } catch { return null; }
  }
  try {
    const resp = await tfetch(url);
    const ct = resp.headers.get("content-type") || "";
    if (!resp.ok) return null;
    return { bytes: await resp.arrayBuffer(), mime: ct.includes("audio") || ct.includes("video") || ct.includes("mp4") ? ct : "audio/mpeg" };
  } catch { return null; }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const sb = service();

    const { data: lead } = await sb.from("leads")
      .select("id, user_id, organization_id, metadata, call_recording_url")
      .eq("id", id).single();
    if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });

    // Idempotent — already have an in-house recording? Nothing to do.
    const { count } = await sb.from("call_uploads").select("id", { count: "exact", head: true }).eq("lead_id", id);
    if ((count ?? 0) > 0) return Response.json({ ok: true, already: true });

    const link = (lead.metadata && typeof (lead.metadata as Record<string, unknown>).source_audio_url === "string"
      ? (lead.metadata as Record<string, unknown>).source_audio_url as string
      : null) || lead.call_recording_url || null;
    if (!link) return Response.json({ ok: true, no_link: true }); // nothing to ingest

    const driveToken = await getDriveAccessToken(sb, lead.user_id as string).catch(() => null);
    const got = await downloadRecording(driveToken, link);
    if (!got) return Response.json({ ok: false, error: "Could not download recording from the link." }, { status: 502 });

    const ext = got.mime.includes("mp4") || got.mime.includes("m4a") ? "m4a" : got.mime.includes("wav") ? "wav" : "mp3";
    const orgFolder = (lead.organization_id as string) || (lead.user_id as string) || "org";
    const path = `${orgFolder}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, got.bytes, { contentType: got.mime, upsert: false });
    if (upErr) return Response.json({ ok: false, error: `Storage upload failed: ${upErr.message}` }, { status: 500 });

    await sb.from("call_uploads").insert({
      lead_id: id, user_id: lead.user_id,
      file_name: "drive-recording." + ext, file_path: path, bucket: BUCKET,
      file_size_bytes: got.bytes.byteLength, storage_url: null, status: "uploaded",
      uploaded_by: lead.user_id,
    });
    await sb.from("leads").update({ audio_size_bytes: got.bytes.byteLength }).eq("id", id);

    return Response.json({ ok: true, ingested: true });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
