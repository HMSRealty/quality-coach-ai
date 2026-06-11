// Per-user monthly AI usage tracking + cost cap enforcement.
// Plans:
//   starter    →  100 analyses / month
//   pro        → 1000 analyses / month
//   enterprise → unlimited
import type { SupabaseClient } from "@supabase/supabase-js";

const PLAN_CAPS: Record<string, number | null> = {
  starter:    100,
  pro:        1000,
  enterprise: null,    // unlimited
};

// Estimated USD per analysis. Adjust as Gemini pricing changes.
const COST_PER_ANALYSIS = 0.02;

export function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface UsageCheck {
  allowed: boolean;
  count: number;
  cap: number | null;
  remaining: number | null;
  reason?: string;
}

export async function checkUsage(sb: SupabaseClient, userId: string): Promise<UsageCheck> {
  const mk = monthKey();
  const { data: profile } = await sb
    .from("profiles")
    .select("plan_tier")
    .eq("id", userId)
    .maybeSingle();
  const plan = (profile?.plan_tier as string) || "starter";
  const cap = PLAN_CAPS[plan] ?? PLAN_CAPS.starter;

  const { data: usage } = await sb
    .from("org_ai_usage")
    .select("analyses_count")
    .eq("user_id", userId)
    .eq("month_key", mk)
    .maybeSingle();

  const count = (usage?.analyses_count as number) || 0;
  if (cap !== null && count >= cap) {
    return {
      allowed: false,
      count, cap,
      remaining: 0,
      reason: `Monthly cap reached (${count}/${cap}). Upgrade plan or wait until next month.`,
    };
  }
  return {
    allowed: true,
    count, cap,
    remaining: cap === null ? null : cap - count,
  };
}

export async function bumpUsage(sb: SupabaseClient, userId: string): Promise<void> {
  await sb.rpc("bump_ai_usage", {
    p_user_id: userId,
    p_month_key: monthKey(),
    p_cost: COST_PER_ANALYSIS,
  });
}
