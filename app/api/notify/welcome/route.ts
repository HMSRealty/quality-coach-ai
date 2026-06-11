// Send the welcome email after a successful signup. Client calls this once
// the auth.signUp + profile insert resolve. No-op if RESEND_API_KEY is unset.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, welcomeEmail } from "@/lib/email";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await sb.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const { subject, html } = welcomeEmail((profile?.full_name as string) || "");
    await sendEmail({ to: user.email || "", subject, html });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
