// Manage the Gemini API key rotation pool for the authenticated user.
// GET    → list keys (no plaintext)
// POST   → add a key (label + key)
// PATCH ?id=... → update is_active / reset_errors
// DELETE ?id=... → remove
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "@/lib/crypto";

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

export async function GET(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    const { data } = await sb.from("gemini_api_keys")
      .select("id, label, is_active, last_used_at, last_error_at, last_error, consecutive_errors, position, assigned_user_id")
      .eq("user_id", user.id)
      .order("position", { ascending: true });
    return NextResponse.json({ ok: true, keys: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 401 });
  }
}

// Only the workspace owner and admins can write the key pool. Regular users
// just see "Integrated ✓" — they never touch the key values.
async function assertManager(sb: ReturnType<typeof admin>, userId: string) {
  const { data } = await sb.from("profiles").select("role, parent_user_id").eq("id", userId).maybeSingle();
  const role = (data?.role as string) || "user";
  const isManager = role === "admin" || role === "owner" || (role === "user" && !data?.parent_user_id);
  if (!isManager) throw new Error("Forbidden — only owners and admins can manage integrations");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    await assertManager(sb, user.id);
    const body = await req.json() as { label?: string; key?: string; assigned_user_id?: string | null };
    const key = (body.key || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "key is required" }, { status: 400 });

    const key_enc = await encryptSecret(key);

    const { data: maxRow } = await sb.from("gemini_api_keys")
      .select("position").eq("user_id", user.id).order("position", { ascending: false }).limit(1).maybeSingle();
    const position = ((maxRow?.position as number) ?? -1) + 1;

    const { data: prof } = await sb.from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
    const orgId = (prof?.organization_id as string) ?? null;

    const { error } = await sb.from("gemini_api_keys").insert({
      user_id: user.id, organization_id: orgId,
      label: (body.label || "").trim() || null,
      key_enc, position,
      assigned_user_id: body.assigned_user_id || null,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    await assertManager(sb, user.id);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const body = await req.json() as { is_active?: boolean; reset_errors?: boolean; label?: string; assigned_user_id?: string | null };
    const update: Record<string, unknown> = {};
    if (typeof body.is_active === "boolean") update.is_active = body.is_active;
    if (body.reset_errors) { update.consecutive_errors = 0; update.last_error = null; }
    if (typeof body.label === "string") update.label = body.label.trim() || null;
    if ("assigned_user_id" in body) update.assigned_user_id = body.assigned_user_id || null;
    await sb.from("gemini_api_keys").update(update).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCaller(req);
    const sb = admin();
    await assertManager(sb, user.id);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    await sb.from("gemini_api_keys").delete().eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
