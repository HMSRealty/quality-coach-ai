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

// Load the first active Readymode connection for a user (legacy "give me one"
// path used by the inbound webhook for general recording fetches).
export async function loadReadymodeCreds(
  sb: SupabaseClient,
  userId: string,
): Promise<ReadymodeCreds | null> {
  const all = await loadAllReadymodeCreds(sb, userId);
  return all[0] || null;
}

// Load ALL active Readymode connections for a user, ordered by position.
// Used by find-recording so we can try each dialer in turn (a phone number
// may have a recording on one dialer but not another).
export async function loadAllReadymodeCreds(
  sb: SupabaseClient,
  userId: string,
): Promise<ReadymodeCreds[]> {
  const { data } = await sb
    .from("readymode_connections")
    .select("subdomain, username, password_enc, is_active, position")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  const out: ReadymodeCreds[] = [];
  for (const row of (data || [])) {
    if (!row.subdomain || !row.username || !row.password_enc) continue;
    try {
      const password = await decryptSecret(row.password_enc as string);
      out.push({
        subdomain: row.subdomain as string,
        username: row.username as string,
        password,
        source: "tenant",
      });
    } catch { /* skip bad ciphertext */ }
  }

  if (out.length === 0) {
    const sub = process.env.READYMODE_SUBDOMAIN;
    const user = process.env.READYMODE_USERNAME;
    const pass = process.env.READYMODE_PASSWORD;
    if (sub && user && pass) {
      out.push({ subdomain: sub, username: user, password: pass, source: "env" });
    }
  }
  return out;
}
