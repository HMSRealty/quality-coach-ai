// Pull the Readymode Agent Report (Logged / Payable / Ready / Break / Lunch / AFK)
// for a date range and upsert per-agent rows into dialer_hours.
//
// Auth: owner/admin on the workspace; the encrypted dialer creds are decrypted
// server-side and never leave the request scope.
//
// Endpoint discovery: Readymode hosts the report at slightly different paths
// across versions. The first sync tries a list of candidates; the path that
// returns parseable rows is cached on readymode_connections.report_url so
// later syncs hit it directly.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";
import { normalizeHost } from "@/lib/readymode";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function getCaller(req: NextRequest) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const sb = admin();
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) throw new Error("Unauthorized");
  return user;
}

async function assertManager(sb: ReturnType<typeof admin>, userId: string) {
  const { data } = await sb.from("profiles").select("role, parent_user_id").eq("id", userId).maybeSingle();
  const role = (data?.role as string) || "user";
  const isManager = role === "admin" || role === "owner" || (role === "user" && !data?.parent_user_id);
  if (!isManager) throw new Error("Forbidden — only owners and admins can sync dialer hours");
}

// ── Cookie jar helpers (shared with find-recording) ──────────────────────
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
const jarToHeader = (jar: Record<string, string>) =>
  Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function loginReadymode(host: string, user: string, pass: string): Promise<Record<string, string>> {
  const loginUrl = `https://${host}/login_new/?then=/`;
  const jar: Record<string, string> = {};
  const getR = await fetch(loginUrl, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow" });
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

// ── Parsing ──────────────────────────────────────────────────────────────
// Convert "1 hours 31 min" / "39 min. 50 s." / "115 hours 33 min" → minutes.
function parseDurationToMinutes(s: string | null | undefined): number {
  if (!s) return 0;
  const txt = String(s).toLowerCase().replace(/\./g, "");
  let total = 0;
  const h = txt.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?/);
  const m = txt.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?/);
  const sec = txt.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?/);
  if (h) total += parseFloat(h[1]) * 60;
  if (m) total += parseFloat(m[1]);
  if (sec) total += parseFloat(sec[1]) / 60;
  return Math.round(total);
}

interface ParsedRow {
  agent_name: string;
  agent_email?: string;
  shift_start?: string;
  shift_end?: string;
  logged_minutes: number;
  payable_minutes: number;
  ready_minutes: number;
  break_minutes: number;
  lunch_minutes: number;
  afk_minutes: number;
  raw_row: Record<string, unknown>;
}

function parseJsonRows(json: unknown): ParsedRow[] {
  // Readymode JSON endpoints typically wrap in {data:[…]} or {rows:[…]} or {results:[…]}
  const obj = json as Record<string, unknown>;
  const list: Record<string, unknown>[] = Array.isArray(obj)
    ? (obj as Record<string, unknown>[])
    : (obj.data as Record<string, unknown>[]) || (obj.rows as Record<string, unknown>[]) || (obj.results as Record<string, unknown>[]) || [];
  const pick = (r: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      for (const real of Object.keys(r)) {
        if (real.toLowerCase().replace(/\s|_/g, "").includes(k)) {
          const v = r[real];
          if (v != null && String(v).trim() !== "") return String(v);
        }
      }
    }
    return "";
  };
  return list
    .map((r): ParsedRow | null => {
      const name = pick(r, ["name", "agent", "user"]);
      if (!name) return null;
      return {
        agent_name: name.trim(),
        agent_email: pick(r, ["email"]) || undefined,
        shift_start: pick(r, ["shiftstart", "starttime", "start"]) || undefined,
        shift_end: pick(r, ["shiftend", "endtime", "end"]) || undefined,
        logged_minutes: parseDurationToMinutes(pick(r, ["loggedtime", "loggedhours", "logged"])),
        payable_minutes: parseDurationToMinutes(pick(r, ["payable"])),
        ready_minutes: parseDurationToMinutes(pick(r, ["ready"])),
        break_minutes: parseDurationToMinutes(pick(r, ["break"])),
        lunch_minutes: parseDurationToMinutes(pick(r, ["lunch"])),
        afk_minutes: parseDurationToMinutes(pick(r, ["afk", "away", "idle"])),
        raw_row: r,
      };
    })
    .filter((x): x is ParsedRow => !!x && !!x.agent_name && x.agent_name.toLowerCase() !== "summary");
}

function parseHtmlRows(html: string): ParsedRow[] {
  // Best-effort: find the first <table>, split <tr>s, then <td>s. Headers in
  // the first row tell us which column is which.
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const rowsRaw = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(m => m[0]);
  if (rowsRaw.length < 2) return [];
  const cells = (tr: string): string[] =>
    [...tr.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim());
  const headers = cells(rowsRaw[0]).map(h => h.toLowerCase().replace(/\s|\(t\)|\./g, ""));
  const idxOf = (...keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
  const iName = idxOf("name", "agent");
  const iStart = idxOf("shiftstart", "starttime", "start");
  const iEnd = idxOf("shiftend", "endtime", "end");
  const iLogged = idxOf("loggedtime", "logged");
  const iPayable = idxOf("payable");
  const iReady = idxOf("ready");
  const iBreak = idxOf("break");
  const iLunch = idxOf("lunch");
  const iAfk = idxOf("afk");
  if (iName < 0) return [];
  const out: ParsedRow[] = [];
  for (let i = 1; i < rowsRaw.length; i++) {
    const c = cells(rowsRaw[i]);
    const name = c[iName] || "";
    if (!name || /^summary$/i.test(name) || /^total/i.test(name)) continue;
    out.push({
      agent_name: name,
      shift_start: iStart >= 0 ? c[iStart] : undefined,
      shift_end: iEnd >= 0 ? c[iEnd] : undefined,
      logged_minutes: parseDurationToMinutes(c[iLogged]),
      payable_minutes: parseDurationToMinutes(c[iPayable]),
      ready_minutes: parseDurationToMinutes(c[iReady]),
      break_minutes: parseDurationToMinutes(c[iBreak]),
      lunch_minutes: parseDurationToMinutes(c[iLunch]),
      afk_minutes: parseDurationToMinutes(c[iAfk]),
      raw_row: { html_cells: c },
    });
  }
  return out;
}

// Readymode uses MM/DD/YYYY in the UI; some endpoints accept YYYY-MM-DD too.
function formatMDY(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

const REPORT_CANDIDATES = [
  "/CCS%20Reports/agentreport/results.json",
  "/CCS%20Reports/agent_report/results.json",
  "/CCS%20Reports/AgentReport/results.json",
  "/CCS%20Reports/agentreport/",
  "/CCS%20Reports/agent_report/",
  "/CCS%20Reports/payroll/results.json",
];

async function tryFetchReport(
  host: string, jar: Record<string, string>, path: string, fromMDY: string, toMDY: string, fromISO: string, toISO: string,
): Promise<{ rows: ParsedRow[]; status: number; url: string } | null> {
  const url = `https://${host}${path}`;
  const referer = `https://${host}/CCS%20Reports/`;
  const headers = {
    "User-Agent": UA, "Cookie": jarToHeader(jar), "Referer": referer, "Origin": `https://${host}`,
    "Accept": "application/json, text/html, */*",
  };
  // Try POST with form params first — most Readymode reports expect this.
  const postBody = new URLSearchParams({
    from: fromMDY, to: toMDY, start_date: fromISO, end_date: toISO,
    date_from: fromMDY, date_to: toMDY, type: "csv",
  });
  let r = await fetch(url, {
    method: "POST", redirect: "follow",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
    body: postBody.toString(),
  });
  let text = await r.text();
  if (r.ok && text) {
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try { const rows = parseJsonRows(JSON.parse(text)); if (rows.length) return { rows, status: r.status, url }; } catch {}
    }
    const rows = parseHtmlRows(text);
    if (rows.length) return { rows, status: r.status, url };
  }
  // Fall back to GET with query string.
  const getUrl = `${url}?from=${encodeURIComponent(fromMDY)}&to=${encodeURIComponent(toMDY)}`;
  r = await fetch(getUrl, { method: "GET", headers, redirect: "follow" });
  text = await r.text();
  if (r.ok && text) {
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      try { const rows = parseJsonRows(JSON.parse(text)); if (rows.length) return { rows, status: r.status, url: getUrl }; } catch {}
    }
    const rows = parseHtmlRows(text);
    if (rows.length) return { rows, status: r.status, url: getUrl };
  }
  return null;
}

// ── Route ────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    await assertManager(sb, user.id);

    const body = await req.json() as { connection_id?: string; from?: string; to?: string };
    const connectionId = body.connection_id;
    const from = body.from;
    const to = body.to;
    if (!connectionId || !from || !to) {
      return NextResponse.json({ ok: false, error: "connection_id, from, to are required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ ok: false, error: "from/to must be YYYY-MM-DD" }, { status: 400 });
    }

    const { data: conn } = await sb.from("readymode_connections")
      .select("id, user_id, subdomain, username, password_enc, is_active, report_url")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conn) return NextResponse.json({ ok: false, error: "Connection not found" }, { status: 404 });
    if (!conn.is_active) return NextResponse.json({ ok: false, error: "Connection is paused" }, { status: 400 });

    const password = await decryptSecret(conn.password_enc as string);
    const host = normalizeHost(conn.subdomain as string);
    const jar = await loginReadymode(host, conn.username as string, password);

    const fromMDY = formatMDY(from);
    const toMDY = formatMDY(to);

    // Prefer the cached path; otherwise probe.
    const candidates = conn.report_url ? [conn.report_url as string, ...REPORT_CANDIDATES] : REPORT_CANDIDATES;
    let hit: { rows: ParsedRow[]; url: string } | null = null;
    let lastStatus = 0;
    for (const path of candidates) {
      const tried = await tryFetchReport(host, jar, path.startsWith("http") ? new URL(path).pathname + new URL(path).search : path, fromMDY, toMDY, from, to);
      if (tried) { hit = tried; break; }
      lastStatus = lastStatus || 404;
    }
    if (!hit) {
      return NextResponse.json({
        ok: false,
        error: "Could not locate the Agent Report endpoint on this dialer. Open the Agent Report in your Readymode admin once, copy the URL from your browser, and paste it into the connection's Report URL field.",
        last_status: lastStatus,
      }, { status: 502 });
    }

    // Cache the URL on the connection for next time.
    if (hit.url !== conn.report_url) {
      await sb.from("readymode_connections").update({ report_url: hit.url }).eq("id", conn.id);
    }

    // Upsert one row per agent for this period.
    const payload = hit.rows.map(r => ({
      user_id: user.id,
      connection_id: conn.id,
      agent_name: r.agent_name,
      agent_email: r.agent_email || null,
      period_from: from,
      period_to: to,
      shift_start: r.shift_start || null,
      shift_end: r.shift_end || null,
      logged_minutes: r.logged_minutes,
      payable_minutes: r.payable_minutes,
      ready_minutes: r.ready_minutes,
      break_minutes: r.break_minutes,
      lunch_minutes: r.lunch_minutes,
      afk_minutes: r.afk_minutes,
      raw_row: r.raw_row,
      synced_at: new Date().toISOString(),
    }));

    if (payload.length === 0) {
      return NextResponse.json({ ok: true, count: 0, message: "No agent rows returned for that range." });
    }

    const { error: upErr } = await sb.from("dialer_hours")
      .upsert(payload, { onConflict: "user_id,connection_id,agent_name,period_from,period_to" });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, count: payload.length, url: hit.url });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// List most recent synced rows for the current workspace, optionally filtered
// by agent or period. Used by the Compensation page to render the table.
export async function GET(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    let q = sb.from("dialer_hours")
      .select("id, connection_id, assigned_user_id, agent_name, agent_email, period_from, period_to, shift_start, shift_end, logged_minutes, payable_minutes, ready_minutes, break_minutes, lunch_minutes, afk_minutes, synced_at")
      .eq("user_id", user.id)
      .order("period_from", { ascending: false })
      .order("agent_name", { ascending: true })
      .limit(500);
    if (from) q = q.gte("period_from", from);
    if (to) q = q.lte("period_to", to);
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rows: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// PATCH: assign a synced row to a RealTrack user (so hours roll into payroll).
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    await assertManager(sb, user.id);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const body = await req.json() as { assigned_user_id?: string | null };
    const { error } = await sb.from("dialer_hours")
      .update({ assigned_user_id: body.assigned_user_id || null })
      .eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
