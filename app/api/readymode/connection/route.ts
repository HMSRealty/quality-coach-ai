// Per-tenant Readymode connection management — supports MULTIPLE dialers
// per user (each can be labeled, enabled/disabled individually).
//
// GET                → list all connections (no passwords)
// POST               → add a new connection
// PATCH ?id=...      → update one (label / is_active / re-test)
// POST  ?test=1      → verify creds without saving
// DELETE ?id=...     → remove one
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto";
import { normalizeHost } from "@/lib/readymode";

export const runtime = "edge";
export const dynamic = "force-dynamic";

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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

async function verifyLogin(subdomain: string, username: string, password: string): Promise<{ ok: boolean; status: number; location: string | null }> {
  const host = normalizeHost(subdomain);
  const loginUrl = `https://${host}/login_new/?then=/`;
  const getR = await fetch(loginUrl, { headers: { "User-Agent": UA, "Accept": "text/html" }, redirect: "follow" }).catch(() => null);
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
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, "Cookie": cookies.join("; "), "Referer": loginUrl, "Origin": `https://${host}` },
    body: body.toString(),
    redirect: "manual",
  }).catch(() => null);
  if (!r) return { ok: false, status: 0, location: null };
  const loc = r.headers.get("location");
  const ok = r.status >= 300 && r.status < 400 && !!loc && !loc.includes("login");
  return { ok, status: r.status, location: loc };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    const { data } = await sb.from("readymode_connections")
      .select("id, label, subdomain, username, is_active, last_used_at, last_login_ok, last_error, position, updated_at")
      .eq("user_id", user.id)
      .order("position", { ascending: true });
    return NextResponse.json({
      ok: true,
      connections: data || [],
      env_fallback_active: (data || []).length === 0 && !!process.env.READYMODE_SUBDOMAIN,
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
    const body = await req.json() as { label?: string; subdomain?: string; username?: string; password?: string };
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
    const v = await verifyLogin(subdomain, username, password);
    const enc = await encryptSecret(password);
    const { data: prof } = await sb.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;

    // Position = max + 1 so new connections go to the end of the rotation
    const { data: maxRow } = await sb.from("readymode_connections")
      .select("position").eq("user_id", user.id).order("position", { ascending: false }).limit(1).maybeSingle();
    const position = ((maxRow?.position as number) ?? -1) + 1;

    const { error } = await sb.from("readymode_connections").insert({
      user_id: user.id, organization_id: orgId,
      label: (body.label || "").trim() || null,
      subdomain, username, password_enc: enc,
      is_active: true, position,
      last_login_ok: v.ok,
      last_error: v.ok ? null : `Login returned status ${v.status}`,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, verified: v.ok, login_status: v.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const body = await req.json() as { label?: string; is_active?: boolean };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.is_active === "boolean") update.is_active = body.is_active;
    if (typeof body.label === "string") update.label = body.label.trim() || null;
    const sb = admin();
    await sb.from("readymode_connections").update(update).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const sb = admin();
    if (id) {
      await sb.from("readymode_connections").delete().eq("id", id).eq("user_id", user.id);
    } else {
      // Backwards compat — if no id, delete all (matches the legacy single-connection behaviour)
      await sb.from("readymode_connections").delete().eq("user_id", user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
