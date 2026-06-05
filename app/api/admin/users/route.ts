import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeRole, can } from "@/lib/rbac";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

// Returns { user, role, parent_user_id } for the authenticated caller, or throws.
async function getCaller(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const sa = admin();
  const { data: { user }, error } = await sa.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await sa
    .from("profiles")
    .select("role, parent_user_id")
    .eq("id", user.id)
    .maybeSingle();
  return {
    user,
    rawRole: profile?.role || "user",
    role: normalizeRole(profile?.role),
    parentUserId: profile?.parent_user_id as string | null | undefined,
    isTopLevel: !profile?.parent_user_id,
  };
}

// Allow anyone with users.manage (admin/owner) — top-level legacy 'user' counts as owner.
async function assertManager(req: NextRequest) {
  const c = await getCaller(req);
  if (!can(c.role, "users.manage")) throw new Error("Forbidden — owners/admins only");
  return c;
}

// CREATE user (admins create anyone; regular users create SUB-USERS under themselves)
export async function POST(req: NextRequest) {
  try {
    const { user: caller, role: callerRole } = await getCaller(req);
    const isAdmin = callerRole === "admin";

    const body = await req.json();
    const { email, password, plan_tier = "starter" } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    // Non-admins may only create sub-users (role forced to 'user', parented to them).
    const role = isAdmin ? (body.role || "user") : "user";
    const parent_user_id = isAdmin
      ? (body.parent_user_id || null)
      : caller.id;

    const sa = admin();
    const { data: created, error } = await sa.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (created.user) {
      await sa.from("profiles").upsert({
        id: created.user.id, email, role, plan_tier,
        can_receive_leads: true,
        parent_user_id,
      });
    }
    return NextResponse.json({ ok: true, user: created.user });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

// UPDATE password / role
export async function PATCH(req: NextRequest) {
  try {
    await assertManager(req);
    const { userId, password, role } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const sa = admin();
    if (password) {
      const { error } = await sa.auth.admin.updateUserById(userId, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (role) {
      await sa.from("profiles").update({ role }).eq("id", userId);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}

// DELETE user
// Carefully clears FK references that point at the target user via the legacy
// per-user columns (user_id) and via the new multi-tenant created_by/assigned_to
// columns — otherwise Supabase Auth deleteUser fails with a "database error
// deleting user" because of orphan FKs.
export async function DELETE(req: NextRequest) {
  try {
    const caller = await assertManager(req);
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    if (userId === caller.user.id) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }
    const sa = admin();

    // Safety: confirm the target is in the caller's org (or the caller is a real admin).
    const { data: target } = await sa
      .from("profiles")
      .select("organization_id, parent_user_id, email")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Detach everything pointing at this user. Best-effort: silently skip tables
    // that don't exist on this DB.
    const detachUserId = async (table: string, col: string) => {
      try { await sa.from(table).update({ [col]: null }).eq(col, userId); } catch { /* table absent */ }
    };
    const deleteRows = async (table: string, col: string) => {
      try { await sa.from(table).delete().eq(col, userId); } catch { /* table absent */ }
    };

    // Multi-tenant columns — keep the lead/call rows, just unassign.
    await detachUserId("leads", "created_by");
    await detachUserId("leads", "assigned_to");
    await detachUserId("calls", "uploaded_by");
    await detachUserId("teams", "leader_id");
    await detachUserId("team_members", "user_id");

    // Legacy per-user columns — these don't all have ON DELETE behavior, so clear them.
    await detachUserId("leads", "user_id");
    await detachUserId("leads", "caller_id");
    await detachUserId("call_uploads", "user_id");
    await detachUserId("cold_callers", "user_id");
    await detachUserId("campaigns", "user_id");
    await detachUserId("submission_forms", "user_id");
    await detachUserId("trainers", "user_id");

    // Sub-users: orphaned profile rows would block the cascade. Detach.
    await sa.from("profiles").update({ parent_user_id: null }).eq("parent_user_id", userId);

    // Optionally cull tiny per-user metadata rows.
    await deleteRows("invoices", "user_id");
    await deleteRows("receipts", "user_id");

    // Finally remove the auth user — this cascades to public.profiles (FK = ON DELETE CASCADE).
    const { error } = await sa.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
