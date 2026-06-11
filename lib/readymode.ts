// Resolve Readymode admin credentials for a user. Tries the encrypted
// per-tenant connection in `readymode_connections` first, then falls back to
// environment defaults so the original single-tenant deployment keeps
// working without disruption.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";

export interface ReadymodeCreds {
  subdomain: string;
  username: string;
  password: string;
  source: "tenant" | "env";
}

export function normalizeHost(subdomain: string): string {
  let s = (subdomain || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!s.includes(".")) s = `${s}.readymode.com`;
  return s;
}

export async function loadReadymodeCreds(
  sb: SupabaseClient,
  userId: string,
): Promise<ReadymodeCreds | null> {
  // 1) per-tenant from the database
  const { data } = await sb
    .from("readymode_connections")
    .select("subdomain, username, password_enc")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.subdomain && data?.username && data?.password_enc) {
    try {
      const password = await decryptSecret(data.password_enc as string);
      return {
        subdomain: data.subdomain as string,
        username: data.username as string,
        password,
        source: "tenant",
      };
    } catch {
      // fall through to env fallback if decryption fails
    }
  }

  // 2) env fallback (preserves the single-tenant HMS deployment)
  const sub = process.env.READYMODE_SUBDOMAIN;
  const user = process.env.READYMODE_USERNAME;
  const pass = process.env.READYMODE_PASSWORD;
  if (sub && user && pass) {
    return { subdomain: sub, username: user, password: pass, source: "env" };
  }

  return null;
}
