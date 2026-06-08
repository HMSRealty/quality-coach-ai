// app/api/google/connect/route.ts
// Returns the Google OAuth consent URL for the signed-in user. The client then
// navigates to it. State is signed and carries the user id back to /callback.
import { serviceClient, signState, authUrl } from "@/lib/googleDrive";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const sb = serviceClient();
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/google/callback`;
    const state = await signState(user.id);
    return Response.json({ ok: true, url: authUrl(redirectUri, state) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
