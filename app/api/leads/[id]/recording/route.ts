// Streams a lead's Google Drive recording so the in-page player can play it
// inline (works for PRIVATE files via the owner's connected Drive token, and
// falls back to the public usercontent download for "anyone with the link").
// Range requests are forwarded so seeking works.
//
//   GET /api/leads/:id/recording
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDriveAccessToken, driveFileId } from "@/lib/googleDrive";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = service();
    const { data: lead } = await sb.from("leads")
      .select("id, user_id, metadata, call_recording_url")
      .eq("id", id).single();
    if (!lead) return new Response("Not found", { status: 404 });

    const driveLink = (lead.metadata && typeof (lead.metadata as Record<string, unknown>).source_audio_url === "string")
      ? (lead.metadata as Record<string, unknown>).source_audio_url as string
      : (lead.call_recording_url || null);
    if (!driveLink) return new Response("No recording", { status: 404 });

    const range = req.headers.get("range") || undefined;
    const fileId = driveFileId(driveLink);

    // PRIVATE Drive via the owner's OAuth token.
    if (fileId) {
      const token = await getDriveAccessToken(sb, lead.user_id as string).catch(() => null);
      if (token) {
        const up = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
        });
        if (up.ok || up.status === 206) return passthrough(up);
      }
      // PUBLIC fallback.
      const pub = await fetch(`https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`, {
        headers: range ? { Range: range } : {},
      });
      const ct = pub.headers.get("content-type") || "";
      if ((pub.ok || pub.status === 206) && !ct.includes("text/html")) return passthrough(pub);
      return new Response("Recording not accessible — connect Google Drive or make the file public.", { status: 502 });
    }

    // Non-Drive direct URL.
    const direct = await fetch(driveLink, { headers: range ? { Range: range } : {} });
    if (direct.ok || direct.status === 206) return passthrough(direct);
    return new Response("Recording not accessible", { status: 502 });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Server error", { status: 500 });
  }
}

function passthrough(up: Response): Response {
  const h = new Headers();
  const ct = up.headers.get("content-type");
  h.set("content-type", ct && !ct.includes("text/html") ? ct : "audio/mpeg");
  for (const k of ["content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = up.headers.get(k);
    if (v) h.set(k, v);
  }
  if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
  h.set("cache-control", "private, max-age=3600");
  return new Response(up.body, { status: up.status, headers: h });
}
