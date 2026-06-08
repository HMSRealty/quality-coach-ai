// Google OAuth + Drive helpers (edge-safe). Used by /api/google/* and the
// analyzer to download PRIVATE Google Drive recordings for the lead's owner.
import { createClient } from "@supabase/supabase-js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function googleClient() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID / SECRET");
  return { id, secret };
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Signed state (CSRF + carries the user id through the redirect) ──
async function hmacHex(data: string): Promise<string> {
  const keyData = new TextEncoder().encode(process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback");
  const key = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function signState(userId: string): Promise<string> {
  const exp = Date.now() + 10 * 60 * 1000;
  const body = `${userId}.${exp}`;
  return `${body}.${await hmacHex(body)}`;
}
export async function verifyState(state: string): Promise<string | null> {
  const parts = (state || "").split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  const expected = await hmacHex(`${userId}.${exp}`);
  return expected === sig ? userId : null;
}

export function authUrl(redirectUri: string, state: string): string {
  const { id } = googleClient();
  const p = new URLSearchParams({
    client_id: id, redirect_uri: redirectUri, response_type: "code",
    scope: SCOPE, access_type: "offline", prompt: "consent",
    include_granted_scopes: "true", state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const { id, secret } = googleClient();
  const r = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!r.ok) throw new Error(`Token exchange failed: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function refreshAccessToken(refreshToken: string) {
  const { id, secret } = googleClient();
  const r = await fetch(TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: id, client_secret: secret, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  return r.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function getUserEmail(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) return null;
    const j = await r.json();
    return j.email ?? null;
  } catch { return null; }
}

// A valid access token for the user (refreshing if needed). null if not connected.
export async function getDriveAccessToken(sb: ReturnType<typeof serviceClient>, userId: string): Promise<string | null> {
  const { data } = await sb.from("google_tokens").select("refresh_token, access_token, expires_at").eq("user_id", userId).maybeSingle();
  if (!data?.refresh_token) return null;
  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (data.access_token && exp > Date.now() + 60_000) return data.access_token;
  const refreshed = await refreshAccessToken(data.refresh_token);
  if (!refreshed?.access_token) return null;
  await sb.from("google_tokens").update({
    access_token: refreshed.access_token,
    expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return refreshed.access_token;
}

export const driveFileId = (u: string): string | null => {
  const m = u.match(/drive\.google\.com\/file\/d\/([^/?#]+)/) || u.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
};
