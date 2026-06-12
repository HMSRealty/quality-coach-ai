// Server-side branding save. Client-side updates to `organizations` were
// silently RLS-blocked for some tenants, so all writes go through this
// endpoint with the service role after a role check.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sb = admin();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await sb.from("profiles")
      .select("role, parent_user_id, organization_id").eq("id", user.id).maybeSingle();
    const role = (prof?.role as string) || "user";
    const isManager = role === "admin" || role === "owner" || (role === "user" && !prof?.parent_user_id);
    if (!isManager) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const orgId = prof?.organization_id as string | undefined;
    if (!orgId) return NextResponse.json({ ok: false, error: "No organization linked to your account" }, { status: 400 });

    const body = await req.json() as {
      brand_name?: string | null;
      brand_logo_url?: string | null;
      brand_color?: string | null;
    };

    const update: Record<string, unknown> = {};
    if ("brand_name" in body) update.brand_name = body.brand_name?.toString().trim() || null;
    if ("brand_logo_url" in body) update.brand_logo_url = body.brand_logo_url || null;
    if ("brand_color" in body) update.brand_color = body.brand_color || null;

    const { error } = await sb.from("organizations").update(update).eq("id", orgId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
