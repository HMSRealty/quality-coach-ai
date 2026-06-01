import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function assertOwner(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Unauthorized");
  const sa = admin();
  const { data: { user }, error } = await sa.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await sa.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") throw new Error("Forbidden — admin only");
  return user;
}

// CREATE user
export async function POST(req: NextRequest) {
  try {
    await assertOwner(req);
    const { email, password, role = "user", plan_tier = "starter" } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }
    const sa = admin();
    const { data: created, error } = await sa.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Provision profile row
    if (created.user) {
      await sa.from("profiles").upsert({
        id: created.user.id, email, role, plan_tier,
        can_receive_leads: true,
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
    await assertOwner(req);
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
export async function DELETE(req: NextRequest) {
  try {
    await assertOwner(req);
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const sa = admin();
    const { error } = await sa.auth.admin.deleteUser(userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
