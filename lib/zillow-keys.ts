// Zillow / RapidAPI key pool — mirrors gemini-keys.ts. Each user can register
// multiple keys. When one returns 429/auth errors, we mark it and rotate to
// the next. After 5 consecutive errors the key auto-disables.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";

const MAX_CONSECUTIVE_ERRORS = 5;

export interface ZillowKey {
  id: string;
  key: string;
  label: string | null;
  source: "tenant" | "env";
}

export async function loadZillowKeys(
  sb: SupabaseClient,
  userId: string,
): Promise<ZillowKey[]> {
  const assigned = await sb
    .from("zillow_api_keys")
    .select("id, label, key_enc")
    .eq("assigned_user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  let rows = assigned.data || [];
  if (rows.length === 0) {
    const legacy = await sb
      .from("zillow_api_keys")
      .select("id, label, key_enc")
      .eq("user_id", userId)
      .is("assigned_user_id", null)
      .eq("is_active", true)
      .order("position", { ascending: true });
    rows = legacy.data || [];
  }

  const out: ZillowKey[] = [];
  for (const row of rows) {
    try {
      const key = await decryptSecret(row.key_enc as string);
      out.push({ id: row.id as string, key, label: (row.label as string) || null, source: "tenant" });
    } catch { /* bad ciphertext */ }
  }

  if (out.length === 0 && process.env.RAPIDAPI_KEY) {
    out.push({ id: "_env", key: process.env.RAPIDAPI_KEY, label: "Platform default", source: "env" });
  }
  return out;
}

export async function markZillowKeyError(sb: SupabaseClient, keyId: string, msg: string): Promise<void> {
  if (keyId === "_env") return;
  const { data: row } = await sb.from("zillow_api_keys").select("consecutive_errors").eq("id", keyId).maybeSingle();
  const next = ((row?.consecutive_errors as number) || 0) + 1;
  await sb.from("zillow_api_keys").update({
    last_error_at: new Date().toISOString(),
    last_error: msg.slice(0, 500),
    consecutive_errors: next,
    is_active: next < MAX_CONSECUTIVE_ERRORS,
  }).eq("id", keyId);
}

export async function markZillowKeySuccess(sb: SupabaseClient, keyId: string): Promise<void> {
  if (keyId === "_env") return;
  await sb.from("zillow_api_keys").update({
    last_used_at: new Date().toISOString(),
    consecutive_errors: 0,
    last_error: null,
  }).eq("id", keyId);
}
