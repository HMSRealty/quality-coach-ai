// app/api/google/callback/route.ts
// Google redirects here after consent. Exchange the code, store the refresh
// token for the user (service role), then bounce back to the integrations page.
import { serviceClient, verifyState, exchangeCode, getUserEmail } from "@/lib/googleDrive";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const settings = `${url.origin}/dashboard/settings/api`;
  try {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "";
    const oauthErr = url.searchParams.get("error");
    if (oauthErr) return Response.redirect(`${settings}?google=denied`, 302);
    if (!code) return Response.redirect(`${settings}?google=error`, 302);

    const userId = await verifyState(state);
    if (!userId) return Response.redirect(`${settings}?google=badstate`, 302);

    const redirectUri = `${url.origin}/api/google/callback`;
    const tok = await exchangeCode(code, redirectUri);
    if (!tok.refresh_token) {
      // No refresh token (already granted before) — still usable via access token,
      // but we need the refresh token for long-term use. Ask to re-consent.
      return Response.redirect(`${settings}?google=norefresh`, 302);
    }

    const email = await getUserEmail(tok.access_token);
    const sb = serviceClient();
    const { data: prof } = await sb.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    await sb.from("google_tokens").upsert({
      user_id: userId,
      organization_id: (prof?.organization_id as string) ?? null,
      email,
      refresh_token: tok.refresh_token,
      access_token: tok.access_token,
      expires_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    return Response.redirect(`${settings}?google=connected`, 302);
  } catch {
    return Response.redirect(`${settings}?google=error`, 302);
  }
}
