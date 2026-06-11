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

const REVIVE = new Set(["disqualified", "error", "needs call"]);
const norm = (s: string) => (s || "").trim().toLowerCase().replace(/[.,#]/g, "").replace(/\s+/g, " ");

interface Body {
  address?: string;
  seller_name?: string;
  campaign_id?: string;
  audio_url?: string;
  phone?: string;
  email?: string;
  agent_name?: string;
  test?: boolean;
}

// Readymode-style form post → our Body. Accepts lead[0][field] (and bare field)
// names: firstName/lastName, phone, email, address/city/state/zip, plus custom
// fields for the recording URL and campaign.
function fromForm(form: FormData | URLSearchParams): Body {
  const get = (...names: string[]): string => {
    for (const n of names) {
      for (const k of [`lead[0][${n}]`, n]) {
        const v = form.get(k);
        if (typeof v === "string" && v.trim()) return v.trim();
      }
    }
    return "";
  };
  const street = get("address", "street", "property_address");
  const city = get("city");
  const state = get("state");
  const zip = get("zip", "postal", "zipcode");
  const address = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const name = [get("firstName", "first_name"), get("lastName", "last_name")].filter(Boolean).join(" ").trim() || get("seller_name", "owner_name", "name");
  return {
    address,
    seller_name: name || undefined,
    phone: get("phone", "phone_number") || undefined,
    email: get("email") || undefined,
    campaign_id: get("campaign_id", "campaign") || undefined,
    audio_url: get("audio_url", "recording_url", "recordingUrl", "call_recording", "call_recording_url", "callRecording", "recording", "drive_link", "call_link") || undefined,
    agent_name: get("agent_name", "agentName", "agent", "caller_name", "callerName", "caller", "user", "userName") || undefined,
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const sb = service();
    const url = new URL(req.url);

    // ── AUTH: Bearer API key (header) OR ?key= in the URL (for dialers that
    // can't set custom headers) → sha-256 lookup ──
    const token = ((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "").trim();
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

    // ── Parse payload: JSON, form-urlencoded, or multipart (Readymode posts forms) ──
    const ct = (req.headers.get("content-type") || "").toLowerCase();
    let b: Body;
    if (ct.includes("application/json")) {
      b = (await req.json().catch(() => ({}))) as Body;
    } else if (ct.includes("multipart/form-data")) {
      b = fromForm(await req.formData().catch(() => new FormData()));
    } else {
      // x-www-form-urlencoded (default for dialer webhooks) or unknown → try text.
      const text = await req.text().catch(() => "");
      try { b = JSON.parse(text) as Body; }
      catch { b = fromForm(new URLSearchParams(text)); }
    }
    // URL params override/fill gaps — lets the whole config live in the URL:
    //   /api/inbound/lead?key=...&campaign_id=...
    // JSON payloads may send "campaign" (name) instead of "campaign_id" (UUID).
    if (!b.campaign_id && (b as Record<string, unknown>).campaign) b.campaign_id = String((b as Record<string, unknown>).campaign);
    if (!b.campaign_id && url.searchParams.get("campaign_id")) b.campaign_id = url.searchParams.get("campaign_id")!;
    if (url.searchParams.get("test") === "true") b.test = true;

    // Connection test: verify auth + endpoint without creating a lead or
    // downloading audio. Triggered by { "test": true } from the UI button.
    if (b.test === true) {
      sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then(() => {});
      return Response.json({ ok: true, test: true, message: "API key valid — endpoint reachable. Your dialer is ready to send leads." });
    }

    // ── NEVER reject a lead for missing data. Required fields (address,
    // campaign, phone, seller name) that are absent are recorded as
    // "Not available" on the lead instead of bouncing the post.
    const address = (b.address || "").trim();
    const audioUrl = (b.audio_url || "").trim();
    const missing: string[] = [];
    if (!address) missing.push("address");
    if (!b.campaign_id) missing.push("campaign");
    if (!(b.phone || "").trim()) missing.push("phone");
    if (!(b.seller_name || "").trim()) missing.push("seller name");

    // Validate the campaign: try UUID match first, then name match (Readymode
    // sends the campaign name, not a UUID).
    let campaignId: string | null = null;
    if (b.campaign_id) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.campaign_id);
      if (isUuid) {
        const { data: camp } = await sb.from("campaigns").select("id").eq("id", b.campaign_id).eq("user_id", userId).maybeSingle();
        campaignId = camp?.id ?? null;
      }
      if (!campaignId) {
        const { data: byName } = await sb.from("campaigns").select("id").ilike("name", b.campaign_id).eq("user_id", userId).maybeSingle();
        campaignId = byName?.id ?? null;
      }
      if (!campaignId && !missing.includes("campaign")) missing.push("campaign");
    }

    // ── Pull the audio (best-effort — a bad link does NOT reject the lead; it
    // just arrives without audio and is flagged). Google Drive links are NOT
    // pre-downloaded here — the queue's ingest step handles them.
    const isDriveLink = /drive\.google\.com|drive\.usercontent\.google\.com/i.test(audioUrl);
    let audioBytes: ArrayBuffer | null = null;
    let audioType = "audio/mpeg";
    let audioExt = "mp3";
    let audioNote: string | null = null;
    if (audioUrl && !isDriveLink) {
      const ar = await fetch(audioUrl).catch(() => null);
      if (!ar || !ar.ok) {
        audioNote = `Recording link unreachable (${ar?.status ?? "network"})`;
      } else {
        const bytes = await ar.arrayBuffer();
        if (bytes.byteLength > 500 * 1024 * 1024) {
          audioNote = "Recording exceeds 500MB — not stored";
        } else {
          audioBytes = bytes;
          audioType = ar.headers.get("content-type") || audioType;
          const m = audioUrl.split("?")[0].match(/\.(mp3|wav|m4a|mp4)$/i);
          if (m) audioExt = m[1].toLowerCase();
        }
      }
    }

    const metadata: Record<string, unknown> = {
      date: new Date().toISOString().split("T")[0],
      owner_name: (b.seller_name || "").trim() || "Not available",
      phone_number: (b.phone || "").trim() || "Not available",
      email: b.email ?? "",
      submitted_via: "inbound_api",
      source_audio_url: audioUrl || null,
      ...(missing.length ? { missing_fields: missing } : {}),
      ...(audioNote ? { audio_note: audioNote } : {}),
    };

    // ── Duplicate detection (same user + normalized address) — only when we
    // actually have an address; "Not available" placeholders never collide.
    let match: { id: string; status: string | null; metadata: Record<string, unknown> | null } | undefined;
    if (address) {
      const { data: candidates } = await sb
        .from("leads")
        .select("id, status, extracted_address, metadata")
        .eq("user_id", userId)
        .ilike("extracted_address", `%${address.slice(0, 60)}%`)
        .limit(20);
      match = (candidates || []).find((c) => norm(c.extracted_address || "") === norm(address)) as typeof match;
    }

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
        campaign_id: campaignId, extracted_address: address, agent_name: (b.agent_name || "").trim() || null,
        status: "Queued", metadata: mergedMeta,
      }).eq("id", match.id);
      if (upErr) return Response.json({ ok: false, error: upErr.message }, { status: 500 });
      leadId = match.id; mode = "revived";
    } else {
      const { data: inserted, error } = await sb.from("leads").insert({
        user_id: userId, organization_id: keyRow.organization_id ?? null,
        campaign_id: campaignId, agent_name: (b.agent_name || "").trim() || null,
        extracted_address: address || "Address not available", status: "Queued", metadata,
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

    // ── ENQUEUE for ordered, one-at-a-time backend analysis (high-volume safe) ──
    // The recording is already stored in-house, so the worker analyzes locally.
    const origin = new URL(req.url).origin;
    fetch(`${origin}/api/leads/process-next`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => { /* worker + heartbeat will still pick it up */ });

    // best-effort key usage stamp
    sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id).then(() => {});

    return Response.json({
      ok: true, leadId, mode, audio: audioUrls.length > 0 || isDriveLink,
      ...(missing.length ? { missing } : {}),
      ...(audioNote ? { audio_note: audioNote } : {}),
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
