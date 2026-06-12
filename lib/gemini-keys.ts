// Gemini API key pool with automatic rotation on errors.
// Each user can register multiple keys. When one returns 429/quota/auth
// errors, we mark it and rotate to the next. After 5 consecutive errors,
// the key is auto-disabled and stays so until the user re-enables it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";

const MAX_CONSECUTIVE_ERRORS_BEFORE_DISABLE = 5;

export interface GeminiKey {
  id: string;
  key: string;          // plaintext, decrypted
  label: string | null;
  source: "tenant" | "env";
}

export async function loadGeminiKeys(
  sb: SupabaseClient,
  userId: string,
): Promise<GeminiKey[]> {
  // New model: keys are added by the RealTrack owner and assigned to a user.
  // First look for keys explicitly assigned to this user; if none, fall back
  // to the legacy "user added their own key" rows so existing tenants keep
  // working.
  const assigned = await sb
    .from("gemini_api_keys")
    .select("id, label, key_enc")
    .eq("assigned_user_id", userId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  let rows = assigned.data || [];
  if (rows.length === 0) {
    const legacy = await sb
      .from("gemini_api_keys")
      .select("id, label, key_enc")
      .eq("user_id", userId)
      .is("assigned_user_id", null)
      .eq("is_active", true)
      .order("position", { ascending: true });
    rows = legacy.data || [];
  }

  const out: GeminiKey[] = [];
  for (const row of rows) {
    try {
      const key = await decryptSecret(row.key_enc as string);
      out.push({
        id: row.id as string,
        key,
        label: (row.label as string) || null,
        source: "tenant",
      });
    } catch { /* skip bad ciphertext */ }
  }

  // Fall back to the global env key so single-tenant keeps working.
  if (out.length === 0 && process.env.GEMINI_API_KEY) {
    out.push({
      id: "_env",
      key: process.env.GEMINI_API_KEY,
      label: "Platform default",
      source: "env",
    });
  }
  return out;
}

export async function markKeyError(
  sb: SupabaseClient,
  keyId: string,
  errorMessage: string,
): Promise<void> {
  if (keyId === "_env") return;
  const { data: row } = await sb
    .from("gemini_api_keys")
    .select("consecutive_errors")
    .eq("id", keyId).maybeSingle();
  const next = ((row?.consecutive_errors as number) || 0) + 1;
  await sb.from("gemini_api_keys").update({
    last_error_at: new Date().toISOString(),
    last_error: errorMessage.slice(0, 500),
    consecutive_errors: next,
    is_active: next < MAX_CONSECUTIVE_ERRORS_BEFORE_DISABLE,
  }).eq("id", keyId);
}

export async function markKeySuccess(
  sb: SupabaseClient,
  keyId: string,
): Promise<void> {
  if (keyId === "_env") return;
  await sb.from("gemini_api_keys").update({
    last_used_at: new Date().toISOString(),
    consecutive_errors: 0,
    last_error: null,
  }).eq("id", keyId);
}

// Call `fn` with each key in turn until one succeeds. Recognises transient
// errors (429/503/network/quota) and rotates; permanent errors throw
// immediately so we don't burn the whole pool on bad inputs.
export async function callWithRotation<T>(
  sb: SupabaseClient,
  userId: string,
  fn: (key: string) => Promise<T>,
): Promise<T> {
  const keys = await loadGeminiKeys(sb, userId);
  if (keys.length === 0) {
    throw new Error("No Gemini API keys configured for this user");
  }
  let lastErr: Error | null = null;
  for (const k of keys) {
    try {
      const result = await fn(k.key);
      await markKeySuccess(sb, k.id);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErr = e instanceof Error ? e : new Error(msg);
      const transient = /\b(429|503|504|quota|rate.?limit|timeout|network|ECONN|fetch failed|UNAVAILABLE|RESOURCE_EXHAUSTED)\b/i.test(msg);
      await markKeyError(sb, k.id, msg);
      if (!transient) break;
    }
  }
  throw lastErr || new Error("All Gemini keys failed");
}
