// app/api/google/status/route.ts — is this user's Google Drive connected?
import { serviceClient } from "@/lib/googleDrive";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, connected: false }, { status: 401 });
    const sb = serviceClient();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return Response.json({ ok: false, connected: false }, { status: 401 });
    const { data } = await sb.from("google_tokens").select("email, updated_at").eq("user_id", user.id).maybeSingle();
    return Response.json({ ok: true, connected: !!data, email: data?.email ?? null, since: data?.updated_at ?? null });
  } catch (e) {
    return Response.json({ ok: false, connected: false, error: e instanceof Error ? e.message : "err" }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false }, { status: 401 });
    const sb = serviceClient();
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return Response.json({ ok: false }, { status: 401 });
    await sb.from("google_tokens").delete().eq("user_id", user.id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
