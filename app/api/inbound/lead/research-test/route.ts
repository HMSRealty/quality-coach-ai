// Test endpoint — given a phone number, login as admin and try several
// Readymode "Research Calls" URLs to find which returns recording IDs.
// Returns the HTTP status + first 4KB of each response so we can pick the
// right URL pattern for the production worker.
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

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = ((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "").trim();
  const phone = (url.searchParams.get("phone") || "").trim();
  if (!token) return Response.json({ ok: false, error: "Missing API key" }, { status: 401 });
  if (!phone) return Response.json({ ok: false, error: "Missing phone param" }, { status: 400 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
  const hash = await sha256hex(token);
  const { data: keyRow } = await sb.from("api_keys").select("user_id, revoked").eq("key_hash", hash).maybeSingle();
  if (!keyRow || keyRow.revoked) return Response.json({ ok: false, error: "Invalid API key" }, { status: 401 });

  const host = "hmsrealty.readymode.com";
  const jar = await loginReadymode(host, process.env.READYMODE_USERNAME || "heggo", process.env.READYMODE_PASSWORD || "heggo");
  const cookie = jarToHeader(jar);
  const cleanPhone = phone.replace(/\D/g, "");

  // Try a handful of plausible URL patterns. The first one that returns HTML
  // containing recording IDs is our answer.
  const candidates = [
    `https://${host}/CCS%20Reports/research/${cleanPhone}`,
    `https://${host}/CCS%20Reports/research?phone=${cleanPhone}`,
    `https://${host}/CCS%20Reports/research/search?phone=${cleanPhone}`,
    `https://${host}/+CCS%20Reports/research?phone=${cleanPhone}`,
    `https://${host}/+CCS%20Reports/research/${cleanPhone}`,
    `https://${host}/CCS Reports/research?phone=${cleanPhone}`,
    `https://${host}/CCS%20Reports/research/DOM/search?phone=${cleanPhone}`,
    `https://${host}/CCS%20Reports/research/DOM/results?phone=${cleanPhone}`,
    `https://${host}/CCS%20Reports/research/results.json?phone=${cleanPhone}`,
    `https://${host}/CCS%20Reports/research/submit?phone=${cleanPhone}`,
  ];

  const results: Array<{ url: string; status: number; ct: string; recIdCount: number; sample: string }> = [];
  for (const u of candidates) {
    try {
      const r = await fetch(u, {
        headers: {
          "User-Agent": UA, "Cookie": cookie, "Referer": `https://${host}/`,
          "Accept": "text/html,application/json,*/*",
        },
        redirect: "follow",
      });
      const text = await r.text();
      // Count recording IDs (the #38543-style numbers near "callrec" or recording links).
      const recIdMatches = text.match(/(?:callrec[^"']*?(\d{4,7})_hq|recording[^"']*?(\d{4,7})|#(\d{4,7}))/gi) || [];
      results.push({
        url: u,
        status: r.status,
        ct: r.headers.get("content-type") || "",
        recIdCount: recIdMatches.length,
        sample: text.slice(0, 1500),
      });
    } catch (e) {
      results.push({ url: u, status: 0, ct: "error", recIdCount: 0, sample: String(e) });
    }
  }

  return Response.json({ ok: true, phone: cleanPhone, results, cookies_used: Object.keys(jar) });
}
