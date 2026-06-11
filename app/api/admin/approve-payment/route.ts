import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ApprovePaymentBody {
  userId: string;
  invoiceId: string;
  planTier: string;
}

const PLAN_LIMITS: Record<string, number> = {
  starter: 100,
  professional: 500,
  enterprise: 99999,
};

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verifyAdmin(authHeader: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;

  const admin = getAdminSupabase();
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const isAdmin = await verifyAdmin(authHeader);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body: ApprovePaymentBody = await request.json();
    const { userId, invoiceId, planTier } = body;

    if (!userId || !invoiceId || !planTier) {
      return NextResponse.json({ error: "userId, invoiceId, and planTier are required." }, { status: 400 });
    }

    const limit = PLAN_LIMITS[planTier] ?? 100;
    const admin = getAdminSupabase();

    // 1. Activate user profile — flip is_approved so the dashboard gate
    // opens, set the plan tier + monthly limit, and mark the invoice paid.
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        is_active: true,
        is_approved: true,
        plan_tier: planTier,
        payment_status: "paid",
        monthly_lead_limit: limit,
      })
      .eq("id", userId);

    if (profileError) {
      return NextResponse.json({ error: "Profile update failed: " + profileError.message }, { status: 400 });
    }

    // 2. Mark invoice as paid
    const { error: invoiceError } = await admin
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoiceId);

    if (invoiceError) {
      return NextResponse.json({ error: "Invoice update failed: " + invoiceError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `User ${userId} activated on ${planTier} plan with ${limit} monthly analyses.`,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
