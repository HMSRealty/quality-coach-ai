// Lightweight per-key rate limiter for the inbound webhook. Uses a Supabase
// table as a sliding-window counter (fine for our scale; can swap to KV/
// Durable Objects later if we need lower latency).
//
// Default: 200 webhook posts per minute per API key. A runaway dialer
// looping the same lead won't blow through the AI budget or the queue.
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT_PER_MIN = 200;

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number;
  reset_in_seconds: number;
}

// Best-effort: returns allowed=true if the table is missing (so a missing
// migration doesn't break webhooks for existing tenants).
export async function checkRateLimit(
  sb: SupabaseClient,
  keyId: string,
  limitPerMinute = DEFAULT_LIMIT_PER_MIN,
): Promise<RateLimitResult> {
  try {
    const minuteKey = new Date().toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
    const { data, error } = await sb.rpc("bump_rate_limit", {
      p_key_id: keyId,
      p_minute_key: minuteKey,
    });
    if (error) {
      return { allowed: true, used: 0, limit: limitPerMinute, reset_in_seconds: 60 };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { count: number } | undefined;
    const used = row?.count ?? 0;
    const now = new Date();
    const resetIn = 60 - now.getUTCSeconds();
    return {
      allowed: used <= limitPerMinute,
      used,
      limit: limitPerMinute,
      reset_in_seconds: resetIn,
    };
  } catch {
    return { allowed: true, used: 0, limit: limitPerMinute, reset_in_seconds: 60 };
  }
}
