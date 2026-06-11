// Debug helper — returns the raw webhook payload from the most recent lead
// created via the inbound endpoint. Authenticated with the same API key.
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = ((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "").trim();
  if (!token) return Response.json({ ok: false, error: "Missing API key" }, { status: 401 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const sb = createClient(supaUrl, supaKey, { auth: { persistSession: false } });

  const hash = await sha256hex(token);
  const { data: keyRow } = await sb
    .from("api_keys").select("user_id, revoked").eq("key_hash", hash).maybeSingle();
  if (!keyRow || keyRow.revoked) {
    return Response.json({ ok: false, error: "Invalid API key" }, { status: 401 });
  }

  const { data } = await sb.from("leads")
    .select("id, created_at, status, extracted_address, metadata")
    .eq("user_id", keyRow.user_id)
    .order("created_at", { ascending: false })
    .limit(5);

  return Response.json({ ok: true, recent: data || [] });
}
