// Transactional email via Resend (https://resend.com). Free tier: 100/day,
// works on Cloudflare edge. Set RESEND_API_KEY + RESEND_FROM env vars.
//
// All functions are fail-open: a missing key or a network blip never breaks
// the calling flow. Errors are silently dropped (and surfaced to Sentry).

const ENDPOINT = "https://api.resend.com/emails";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "RealTrack <info@realtrack.app>";
  if (!apiKey || !to) return false;
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, ""),
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Pre-baked templates ────────────────────────────────────────────────────

// The public URL for links in emails. Set NEXT_PUBLIC_APP_URL to your
// custom domain (e.g. "https://app.realtrack.com") once DNS is pointed.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "${APP_URL}").replace(/\/$/, "");

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  max-width: 540px; margin: 0 auto; padding: 32px 24px;
  color: #0F172A; background: #fff;
`;
const BUTTON = `
  display: inline-block; padding: 12px 22px; border-radius: 10px;
  background: linear-gradient(120deg, #6B3FA0, #3B82F6); color: #fff !important;
  text-decoration: none; font-weight: 800; font-size: 14px; margin: 16px 0;
`;

export function welcomeEmail(name: string): { subject: string; html: string } {
  const first = name?.split(" ")[0] || "there";
  return {
    subject: "Welcome to RealTrack — please complete payment to activate",
    html: `<div style="${BASE_STYLE}">
      <h1 style="font-size:22px;font-weight:900;margin:0 0 12px">Welcome, ${first}!</h1>
      <p style="font-size:14px;line-height:1.6;color:#475569">
        Your RealTrack account has been created. To unlock your dashboard, choose a plan and submit your bank transfer receipt.
      </p>
      <a href="${APP_URL}/pay" style="${BUTTON}">View Plans & Pay →</a>
      <p style="font-size:12px;color:#94A3B8;margin-top:24px">
        Reply to this email if you have any questions.
      </p>
    </div>`,
  };
}

export function paymentReceivedEmail(name: string): { subject: string; html: string } {
  const first = name?.split(" ")[0] || "there";
  return {
    subject: "We received your payment receipt",
    html: `<div style="${BASE_STYLE}">
      <h1 style="font-size:22px;font-weight:900;margin:0 0 12px">Thanks, ${first}!</h1>
      <p style="font-size:14px;line-height:1.6;color:#475569">
        We received your bank transfer receipt and are reviewing it now. We typically activate accounts within <strong>1–4 business hours</strong>.
        You'll get another email the moment your dashboard unlocks.
      </p>
      <p style="font-size:12px;color:#94A3B8;margin-top:24px">
        Need help? Reply to this email.
      </p>
    </div>`,
  };
}

export function approvedEmail(name: string, planTier: string): { subject: string; html: string } {
  const first = name?.split(" ")[0] || "there";
  return {
    subject: "Your RealTrack account is live 🎉",
    html: `<div style="${BASE_STYLE}">
      <h1 style="font-size:22px;font-weight:900;margin:0 0 12px">You're in, ${first}!</h1>
      <p style="font-size:14px;line-height:1.6;color:#475569">
        Your account is now active on the <strong>${planTier}</strong> plan.
      </p>
      <p style="font-size:14px;line-height:1.6;color:#475569">
        Next: complete the 3-step setup wizard to get leads flowing.
      </p>
      <a href="${APP_URL}/dashboard/onboarding" style="${BUTTON}">Open Setup Wizard →</a>
      <p style="font-size:12px;color:#94A3B8;margin-top:24px">
        Questions? Reply to this email.
      </p>
    </div>`,
  };
}
