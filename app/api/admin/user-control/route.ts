import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface UserControlBody {
  targetUserId: string;
  geminiApiKey?: string;
  monthlyLeadLimit?: number;
  isActive?: boolean;
  planTier?: string;
  role?: string;
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function verifyAdmin(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getAdminSupabase();
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin" ? user.id : null;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const adminId = await verifyAdmin(authHeader);
    if (!adminId) {
      return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body: UserControlBody = await request.json();
    const { targetUserId, geminiApiKey, monthlyLeadLimit, isActive, planTier, role } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required." }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (geminiApiKey !== undefined)      updatePayload.gemini_api_key     = geminiApiKey;
    if (monthlyLeadLimit !== undefined)  updatePayload.monthly_lead_limit = monthlyLeadLimit;
    if (isActive !== undefined)          updatePayload.is_active           = isActive;
    if (planTier !== undefined)          updatePayload.plan_tier           = planTier;
    if (role !== undefined)              updatePayload.role                = role;

    const admin = getAdminSupabase();
    const { error } = await admin.from("profiles").update(updatePayload).eq("id", targetUserId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, updated: updatePayload });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
