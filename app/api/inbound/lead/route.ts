// app/api/inbound/lead/route.ts
// Inbound webhook ingestion for external dialers (Readymode, BatchDialer, …).
// The dialer POSTs a lead + a public audio URL; we pull the audio into our
// private bucket, create/revive the lead, and run the same AI pipeline as the
// manual form.
//
//   POST /api/inbound/lead
//   Authorization: Bearer <API_KEY>
//   { "address": "...", "seller_name": "...", "campaign_id": "...", "audio_url": "https://..." }
//
// Smart duplicate bypass: a same-address lead previously Disqualified/Error is
// revived and re-analyzed; any other existing status returns 409.
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

const REVIVE = new Set(["disqualified", "error"]);
const norm = (s: string) => (s || "").trim().toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ");

interface Body {
  address?: string;
  seller_name?: string;
  campaign_id?: string;
  audio_url?: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const sb = service();

    // ── AUTH: Bearer API key → sha-256 lookup ──
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return Response.json({ ok: false, error: "Missing API key" }, { status: 401 });
    const hash = await sha256hex(token);
    const { data: keyRow } = await sb
      .from("api_keys")
      .select("id, user_id, organization_id, revoked")
      .eq("key_hash", hash)
      .maybeSingle();
    if (!keyRow || keyRow.revoked) {
      return Response.json({ ok: false, error: "Invalid or revoked API key" }, { status: 401 });
    }
    const userId: string = keyRow.user_id;

    // ── Validate payload ──
    const b = (await req.json().catch(() => ({}))) as Body;
    const address = (b.address || "").trim();
    const audioUrl = (b.audio_url || "").trim();
    if (!address) return Response.json({ ok: false, error: "address is required" }, { status: 400 });
    if (!b.campaign_id) return Response.json({ ok: false, error: "campaign_id is required" }, { status: 400 });

    // ── Pull the audio first (so we never create an orphan lead) ──
    let audioBytes: ArrayBuffer | null = null;
    let audioType = "audio/mpeg";
    let audioExt = "mp3";
    if (audioUrl) {
      const ar = await fetch(audioUrl).catch(() => null);
      if (!ar || !ar.ok) {
        return Response.json({ ok: false, error: `Could not download audio_url (${ar?.status ?? "network"})` }, { status: 422 });
      }
      audioBytes = await ar.arrayBuffer();
      audioType = ar.headers.get("content-type") || audioType;
      const m = audioUrl.split("?")[0].match(/\.(mp3|wav|m4a|mp4)$/i);
      if (m) audioExt = m[1].toLowerCase();
      if (audioBytes.byteLength > 500 * 1024 * 1024) {
        return Response.json({ ok: false, error: "Audio exceeds 500MB" }, { status: 413 });
      }
    }

    const metadata = {
      date: new Date().toISOString().split("T")[0],
      owner_name: b.seller_name ?? "",
      submitted_via: "inbound_api",
      source_audio_url: audioUrl || null,
    };

    // ── Duplicate detection (same user + normalized address) ──
    const { data: candidates } = await sb
      .from("leads")
      .select("id, status, extracted_address, metadata")
      .eq("user_id", userId)
      .ilike("extracted_address", `%${address.slice(0, 60)}%`)
      .limit(20);
    const match = (candidates || []).find((c) => norm(c.extracted_address || "") === norm(address));

    let leadId: string;
    let mode: "new" | "revived";

    if (match) {
      const prev = (match.status || "").toLowerCase();
      if (!REVIVE.has(prev)) {
        return Response.json(
          { ok: false, duplicate: true, leadId: match.id, status: match.status,
            error: `Address already exists (status: ${match.status}).` },
          { status: 409 },
        );
      }
      const mergedMeta = { ...(match.metadata as Record<string, unknown> || {}), ...metadata, revived_from: match.status };
      const { error: upErr } = await sb.from("leads").update({
        campaign_id: b.campaign_id, extracted_address: address, agent_name: b.seller_name ?? null,
        status: "Processing", metadata: mergedMeta,
      }).eq("id", match.id);
      if (upErr) return Response.json({ ok: false, error: upErr.message }, { status: 500 });
      leadId = match.id; mode = "revived";
    } else {
      const { data: inserted, error } = await sb.from("leads").insert({
        user_id: userId, organization_id: keyRow.organization_id ?? null,
        campaign_id: b.campaign_id, agent_name: b.seller_name ?? null,
        extracted_address: address, status: "Processing", metadata,
      }).select("id").single();
      if (error || !inserted) return Response.json({ ok: false, error: error?.message || "Insert failed" }, { status: 500 });
      leadId = inserted.id; mode = "new";
    }

    // ── Store audio in the private bucket + register call_uploads ──
    const audioUrls: string[] = [];
    if (audioBytes) {
      const BUCKET = "call-recordings";
      const folder = keyRow.organization_id || userId;
      const path = `${folder}/${leadId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${audioExt}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, audioBytes, { contentType: audioType, upsert: false });
      if (!upErr) {
        const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (signed?.signedUrl) audioUrls.push(signed.signedUrl);
        await sb.from("call_uploads").insert({
          lead_id: leadId, user_id: userId,
          file_name: `inbound.${audioExt}`, file_path: path, bucket: BUCKET,
          file_size_bytes: audioBytes.byteLength, storage_url: null, status: "uploaded", uploaded_by: userId,
        });
      }
    }

    // ── Fire the SAME AI analysis pipeline as the manual form ──
    const origin = new URL(req.url).origin;
    try {
      await fetch(`${origin}/api/leads/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, ...(audioUrls.length ? { audioUrls } : {}) }),
      });
    } catch { /* lead stays Processing; can be re-run */ }

    // best-effort key usage stamp
    sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then(() => {});

    return Response.json({ ok: true, leadId, mode, audio: audioUrls.length > 0 });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
