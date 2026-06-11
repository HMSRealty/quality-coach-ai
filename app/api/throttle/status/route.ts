// Read-only throttle status — used by the floating monitor to show the
// current run/pause phase and seconds remaining.
import { createClient } from "@supabase/supabase-js";
import { readThrottle } from "@/lib/throttle";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const state = await readThrottle(sb);
  return Response.json({ ok: true, state });
}
