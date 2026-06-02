// app/api/admin/impersonate/route.ts
// Mints a one-time magic-link token for a target user so an admin (or a
// parent user) can fully "act as" that user in the browser. The client
// then calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
// to establish a real session as the target.

import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase service env vars");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const sa = admin();

    // Who is asking?
    const { data: { user: caller }, error: cErr } = await sa.auth.getUser(token);
    if (cErr || !caller) return json({ error: "Unauthorized" }, 401);

    const { targetUserId } = await req.json();
    if (!targetUserId) return json({ error: "targetUserId required" }, 400);

    // Caller profile + target profile
    const { data: callerProfile } = await sa
      .from("profiles").select("role").eq("id", caller.id).maybeSingle();
    const { data: target } = await sa
      .from("profiles").select("id, email, parent_user_id").eq("id", targetUserId).maybeSingle();

    if (!target) return json({ error: "Target user not found" }, 404);

    // Authorization: admins can impersonate anyone; a parent can impersonate
    // only their own sub-users.
    const isAdmin = callerProfile?.role === "admin";
    const isParent = target.parent_user_id === caller.id;
    if (!isAdmin && !isParent) {
      return json({ error: "Forbidden — you can only act as your own sub-users" }, 403);
    }
    if (target.id === caller.id) {
      return json({ error: "Cannot impersonate yourself" }, 400);
    }

    // Generate a magic-link token for the target user
    const { data: link, error: linkErr } = await sa.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      return json({ error: linkErr?.message || "Could not generate session" }, 500);
    }

    return json({
      ok: true,
      email: target.email,
      token_hash: link.properties.hashed_token,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}
