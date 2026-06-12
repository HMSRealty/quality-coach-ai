// Used by the Integrations page to populate the "assign to user" dropdown.
// Only owner/admin callers see the list; everyone else gets 403.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sb = admin();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: me } = await sb.from("profiles").select("role, parent_user_id").eq("id", user.id).maybeSingle();
    const role = (me?.role as string) || "user";
    const isManager = role === "admin" || role === "owner" || (role === "user" && !me?.parent_user_id);
    if (!isManager) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    // All top-level (owner/admin/standalone) profiles — these are the tenants
    // who can own integrations.
    const { data } = await sb.from("profiles")
      .select("id, email, full_name, role")
      .or("parent_user_id.is.null,role.eq.admin,role.eq.owner")
      .order("created_at", { ascending: false })
      .limit(500);

    return NextResponse.json({ ok: true, users: data || [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
