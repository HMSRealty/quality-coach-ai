// Per-tenant Readymode connection management.
// GET    → returns current connection status (no password)
// POST   → upsert subdomain + username + password (encrypted at rest)
// DELETE → remove the connection
// POST ?test=1 → verify the credentials by attempting an admin login
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto";
import { normalizeHost } from "@/lib/readymode";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCaller(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const sb = admin();
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) throw new Error("Unauthorized");
  return user;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

// Lightweight verify — replays the login flow and checks for the 302 → "/"
async function verifyLogin(subdomain: string, username: string, password: string): Promise<{ ok: boolean; status: number; location: string | null }> {
  const host = normalizeHost(subdomain);
  const loginUrl = `https://${host}/login_new/?then=/`;
  // GET first to harvest PHPSESSID
  const getR = await fetch(loginUrl, {
    headers: { "User-Agent": UA, "Accept": "text/html" },
    redirect: "follow",
  }).catch(() => null);
  const cookies: string[] = [];
  const setG = (getR?.headers as unknown as { getSetCookie?: () => string[] })?.getSetCookie?.() || [];
  for (const sc of setG) { const f = sc.split(";")[0]; if (f.includes("=")) cookies.push(f.trim()); }

  const body = new URLSearchParams({
    autoequals: "WebRTC", user_tz: "America/New_York",
    use_phone_module: "auto", then: "/",
    login_account: username, login_password: password,
    login_as_admin: "", logout_other_sessions: "on",
  });
  const r = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA, "Cookie": cookies.join("; "),
      "Referer": loginUrl, "Origin": `https://${host}`,
    },
    body: body.toString(),
    redirect: "manual",
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, location: null };
  const loc = r.headers.get("location");
  // 302 → "/" or similar = success. 200 = login form re-rendered = failure.
  const ok = r.status >= 300 && r.status < 400 && !!loc && !loc.includes("login");
  return { ok, status: r.status, location: loc };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    const { data } = await sb.from("readymode_connections")
      .select("subdomain, username, last_used_at, last_login_ok, last_error, updated_at")
      .eq("user_id", user.id).maybeSingle();
    return NextResponse.json({
      ok: true,
      connection: data || null,
      env_fallback_active: !data && !!process.env.READYMODE_SUBDOMAIN,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const url = new URL(req.url);
    const isTest = url.searchParams.get("test") === "1";
    const body = await req.json() as { subdomain?: string; username?: string; password?: string };
    const subdomain = (body.subdomain || "").trim();
    const username = (body.username || "").trim();
    const password = body.password || "";
    if (!subdomain || !username || !password) {
      return NextResponse.json({ ok: false, error: "subdomain, username, password are all required" }, { status: 400 });
    }

    if (isTest) {
      const v = await verifyLogin(subdomain, username, password);
      return NextResponse.json({ ok: v.ok, login_status: v.status, location: v.location });
    }

    const sb = admin();
    // Verify before saving so we don't store bad credentials.
    const v = await verifyLogin(subdomain, username, password);
    const enc = await encryptSecret(password);
    const { data: prof } = await sb.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;

    const { error } = await sb.from("readymode_connections").upsert({
      user_id: user.id,
      organization_id: orgId,
      subdomain,
      username,
      password_enc: enc,
      last_login_ok: v.ok,
      last_error: v.ok ? null : `Login returned status ${v.status}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, verified: v.ok, login_status: v.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    await sb.from("readymode_connections").delete().eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// Intentionally no extra exports — Next.js route files only allow HTTP
// method handlers + the runtime/dynamic configs.
