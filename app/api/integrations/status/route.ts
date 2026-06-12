// Read-only status counts for the end-user Integrations page. Returns how
// many keys the workspace owner has assigned to the caller, per provider.
// Never returns any key values.
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

    const gp = sb.from("gemini_api_keys").select("id", { count: "exact", head: true })
      .eq("assigned_user_id", user.id).eq("is_active", true);
    const zp = sb.from("zillow_api_keys").select("id", { count: "exact", head: true })
      .eq("assigned_user_id", user.id).eq("is_active", true);
    const rp = sb.from("readymode_connections").select("id", { count: "exact", head: true })
      .eq("assigned_user_id", user.id).eq("is_active", true);

    const [g, z, r] = await Promise.all([gp, zp, rp]);
    return NextResponse.json({
      ok: true,
      gemini: g.count || 0,
      zillow: z.count || 0,
      readymode: r.count || 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
