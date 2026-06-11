// Read the global analyzer throttle state. Anything that calls Gemini should
// check this first and skip if we're in the "paused" phase. Cron ticks the
// cycle (run→pause→run→…) so processing self-stops every 4.5 min for a
// 2-min cooldown, preventing the rate-limit storms that cause errors.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ThrottleState {
  phase: "running" | "paused";
  phase_started_at: string;
  run_seconds: number;
  pause_seconds: number;
  seconds_left_in_phase: number;
}

export async function tickThrottle(sb: SupabaseClient): Promise<ThrottleState> {
  const { data } = await sb.rpc("tick_analyzer_throttle");
  if (!data) {
    // Shouldn't happen — table is seeded with a singleton row.
    return { phase: "running", phase_started_at: new Date().toISOString(), run_seconds: 270, pause_seconds: 120, seconds_left_in_phase: 270 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { phase: string; phase_started_at: string; run_seconds: number; pause_seconds: number };
  const phase = (row.phase === "paused" ? "paused" : "running") as "paused" | "running";
  const window = phase === "running" ? row.run_seconds : row.pause_seconds;
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(row.phase_started_at).getTime()) / 1000));
  return {
    phase,
    phase_started_at: row.phase_started_at,
    run_seconds: row.run_seconds,
    pause_seconds: row.pause_seconds,
    seconds_left_in_phase: Math.max(0, window - elapsed),
  };
}

// Lightweight read-only fetch (no tick) for the UI dashboard.
export async function readThrottle(sb: SupabaseClient): Promise<ThrottleState | null> {
  const { data } = await sb.from("analyzer_throttle").select("*").eq("id", 1).maybeSingle();
  if (!data) return null;
  const phase = (data.phase === "paused" ? "paused" : "running") as "paused" | "running";
  const window = phase === "running" ? (data.run_seconds as number) : (data.pause_seconds as number);
  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(data.phase_started_at as string).getTime()) / 1000));
  return {
    phase,
    phase_started_at: data.phase_started_at as string,
    run_seconds: data.run_seconds as number,
    pause_seconds: data.pause_seconds as number,
    seconds_left_in_phase: Math.max(0, window - elapsed),
  };
}
