import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface BroadcastBody {
  subject: string;
  body: string;
  recipients: string[];
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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin";
}

async function sendViaSMTP(subject: string, body: string, to: string): Promise<void> {
  // Nodemailer / SMTP integration point.
  // Install: npm install nodemailer @types/nodemailer
  // Configure env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  //
  // Example implementation (uncomment after installing nodemailer):
  //
  // const nodemailer = await import("nodemailer");
  // const transporter = nodemailer.createTransport({
  //   host: process.env.SMTP_HOST,
  //   port: Number(process.env.SMTP_PORT ?? 587),
  //   secure: false,
  //   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  // });
  // await transporter.sendMail({
  //   from: process.env.SMTP_FROM ?? "Quality Coach AI <noreply@qualitycoach.ai>",
  //   to,
  //   subject,
  //   text: body,
  //   html: `<pre style="font-family:sans-serif;white-space:pre-wrap;">${body}</pre>`,
  // });

  // Fallback: log to console until SMTP is configured
  console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  void body;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const isAdmin = await verifyAdmin(authHeader);
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const body: BroadcastBody = await request.json();
    const { subject, body: emailBody, recipients } = body;

    if (!subject?.trim() || !emailBody?.trim()) {
      return NextResponse.json({ error: "subject and body are required." }, { status: 400 });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required." }, { status: 400 });
    }

    const errors: string[] = [];
    let sent = 0;

    // Send sequentially with error collection so one bad address doesn't abort the batch
    for (const email of recipients) {
      try {
        await sendViaSMTP(subject, emailBody, email);
        sent++;
      } catch (err: unknown) {
        errors.push(`${email}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
