// Find the most recent Readymode call recording for a phone number, fetch
// it, and attach it to an existing lead. The webhook from Readymode fires
// when a lead is loaded into the dialer (BEFORE the call), so the recording
// doesn't exist yet. This endpoint is meant to be called by a cron worker
// (or manually) some minutes later, once the call has happened.
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function mergeSetCookies(jar: Record<string, string>, r: Response): void {
  const setCookies = (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  for (const sc of setCookies) {
    const first = sc.split(";")[0];
    if (!first || !first.includes("=")) continue;
    const eq = first.indexOf("=");
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) jar[name] = value;
  }
}
function jarToHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

function readymodeHost(sub: string): string {
  let s = (sub || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!s.includes(".")) s = `${s}.readymode.com`;
  return s;
}

function buildRecordingUrl(host: string, id: string): string {
  const n = Number(id);
  const last = String(n % 100).padStart(2, "0");
  const mid = String(Math.floor(n / 100) % 100).padStart(2, "0");
  return `https://${host}/File%20types/data/callrec/db/${last}/${mid}/${id}_hq.mp3?force_dl=1`;
}

async function loginReadymode(host: string, user: string, pass: string): Promise<Record<string, string>> {
  const loginUrl = `https://${host}/login_new/?then=/`;
  const jar: Record<string, string> = {};
  const getR = await fetch(loginUrl, {
    headers: { "User-Agent": UA, "Accept": "text/html" },
    redirect: "follow",
  });
  mergeSetCookies(jar, getR);
  const body = new URLSearchParams({
    autoequals: "WebRTC", user_tz: "America/New_York",
    use_phone_module: "auto", then: "/",
    login_account: user, login_password: pass,
    login_as_admin: "", logout_other_sessions: "on",
  });
  const postR = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA, "Cookie": jarToHeader(jar),
      "Referer": loginUrl, "Origin": `https://${host}`,
    },
    body: body.toString(),
    redirect: "manual",
  });
  mergeSetCookies(jar, postR);
  return jar;
}

// Pull recording IDs from the Research Calls HTML. Try several patterns
// because the response may render the link, an embedded audio player, or
// just the recording ID with a download icon.
function extractRecordingIds(html: string): { ids: string[]; matchedBy: Record<string, number> } {
  const ids = new Set<string>();
  const matchedBy: Record<string, number> = {};
  const patterns: Array<{ name: string; re: RegExp }> = [
    { name: "callrec_hq", re: /callrec[^"'<>\s]*?(\d{3,8})_hq\.mp3/gi },
    { name: "callrec_loose", re: /callrec[^"'<>\s]*?(\d{4,8})/gi },
    { name: "recId_attr", re: /\brecId[\s=:'"]*?(\d{4,8})/gi },
    { name: "recording_attr", re: /\brecording[_-]?id[\s=:'"]*?(\d{4,8})/gi },
    { name: "hash_id", re: /#(\d{4,7})\b/g },
    { name: "download_link", re: /download[^"'<>\s]*?(\d{4,8})/gi },
  ];
  for (const { name, re } of patterns) {
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(html)) !== null) {
      ids.add(m[1]);
      count++;
    }
    if (count) matchedBy[name] = count;
  }
  return { ids: [...ids], matchedBy };
}

// Public API
export async function POST(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const token = ((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "").trim();
    if (!token) return Response.json({ ok: false, error: "Missing API key" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { phone?: string; lead_id?: string };
    const phoneRaw = (body.phone || "").trim();
    const leadId = (body.lead_id || "").trim();
    if (!phoneRaw && !leadId) return Response.json({ ok: false, error: "phone or lead_id required" }, { status: 400 });

    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const sb = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

    const hash = await sha256hex(token);
    const { data: keyRow } = await sb.from("api_keys").select("user_id, organization_id, revoked").eq("key_hash", hash).maybeSingle();
    if (!keyRow || keyRow.revoked) return Response.json({ ok: false, error: "Invalid API key" }, { status: 401 });

    // Resolve target lead (by lead_id if given, else find latest with matching phone)
    let lead: { id: string; metadata: Record<string, unknown> | null } | null = null;
    let phone = phoneRaw;
    if (leadId) {
      const { data } = await sb.from("leads").select("id, metadata").eq("id", leadId).eq("user_id", keyRow.user_id).maybeSingle();
      if (!data) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });
      lead = data;
      if (!phone) phone = String((data.metadata as Record<string, unknown> | null)?.phone_number || "");
    }
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) return Response.json({ ok: false, error: "Need a 10-digit phone number" }, { status: 400 });

    const host = readymodeHost(process.env.READYMODE_SUBDOMAIN || "hmsrealty");
    const user = process.env.READYMODE_USERNAME || "heggo";
    const pass = process.env.READYMODE_PASSWORD || "heggo";

    // Login + fetch research page
    const jar = await loginReadymode(host, user, pass);
    const cookie = jarToHeader(jar);
    const researchUrl = `https://${host}/CCS%20Reports/research/results.json?phone=${cleanPhone}`;
    const rr = await fetch(researchUrl, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Referer": `https://${host}/`, "Accept": "text/html,*/*" },
      redirect: "follow",
    });
    const html = await rr.text();
    const { ids, matchedBy } = extractRecordingIds(html);
    if (ids.length === 0) {
      // Surface a larger sample so we can iterate on the regex if needed.
      // Try to find the "Connection logs" section since that's where the
      // recording rows live in the screenshot.
      const connIdx = html.toLowerCase().indexOf("connection log");
      const slice = connIdx >= 0 ? html.slice(connIdx, connIdx + 4000) : html.slice(0, 4000);
      return Response.json({
        ok: false, error: "No recordings found for phone",
        phone: cleanPhone, html_status: rr.status, html_length: html.length,
        connection_logs_idx: connIdx, sample: slice,
      });
    }

    // Pick the most recent recording: highest numeric id (recording IDs are
    // sequential in Readymode).
    const newest = ids.map(Number).sort((a, b) => b - a)[0];
    const audioUrl = buildRecordingUrl(host, String(newest));

    // Fetch the MP3 with the same admin session.
    const ar = await fetch(audioUrl, {
      headers: { "User-Agent": UA, "Cookie": cookie, "Referer": `https://${host}/`, "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8" },
      redirect: "follow",
    });
    const ct = (ar.headers.get("content-type") || "").toLowerCase();
    if (!ar.ok || ct.includes("text/html")) {
      return Response.json({ ok: false, error: "Recording fetch failed", status: ar.status, content_type: ct, ids });
    }
    const bytes = await ar.arrayBuffer();
    if (bytes.byteLength < 1024) {
      return Response.json({ ok: false, error: "Recording fetch returned tiny payload — likely error", bytes: bytes.byteLength, ids });
    }

    // If we have a lead, attach this recording.
    let attached_to: string | null = null;
    if (!lead) {
      // Find the most recent matching lead by phone for this user.
      const norm = cleanPhone.slice(-10);
      const { data: cands } = await sb.from("leads")
        .select("id, metadata, created_at")
        .eq("user_id", keyRow.user_id)
        .order("created_at", { ascending: false })
        .limit(50);
      const found = (cands || []).find((c) => {
        const p = String((c.metadata as Record<string, unknown> | null)?.phone_number || "").replace(/\D/g, "").slice(-10);
        return p === norm;
      });
      lead = found ? { id: found.id, metadata: found.metadata as Record<string, unknown> | null } : null;
    }

    if (lead) {
      const BUCKET = "call-recordings";
      const folder = keyRow.organization_id || keyRow.user_id;
      const path = `${folder}/${lead.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: "audio/mpeg", upsert: false });
      if (!upErr) {
        await sb.from("call_uploads").insert({
          lead_id: lead.id, user_id: keyRow.user_id,
          file_name: `readymode-${newest}.mp3`, file_path: path, bucket: BUCKET,
          file_size_bytes: bytes.byteLength, storage_url: null, status: "uploaded", uploaded_by: keyRow.user_id,
        });
        // Mark lead with recording id + re-queue analysis.
        const newMeta = { ...(lead.metadata as Record<string, unknown> || {}), recording_id: String(newest), source_audio_url: audioUrl };
        await sb.from("leads").update({ status: "Queued", metadata: newMeta }).eq("id", lead.id);
        attached_to = lead.id;
        // Kick the worker
        const origin = new URL(req.url).origin;
        fetch(`${origin}/api/leads/process-next`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: keyRow.user_id }),
        }).catch(() => {});
      }
    }

    return Response.json({
      ok: true,
      phone: cleanPhone,
      recording_ids_found: ids,
      matched_by: matchedBy,
      newest_recording_id: String(newest),
      audio_url: audioUrl,
      audio_bytes: bytes.byteLength,
      attached_to,
    });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
