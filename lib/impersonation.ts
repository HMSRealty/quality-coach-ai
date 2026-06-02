import { supabase } from "@/lib/supabase";

const RETURN_KEY = "impersonation_return";
const ACTING_KEY = "impersonating_email";

// Start acting as another user. Saves the current (admin/parent) session so we
// can return, mints a magic-link token server-side, then establishes a real
// session as the target user.
export async function startImpersonation(targetUserId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");

  const res = await fetch("/api/admin/impersonate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ targetUserId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Could not start impersonation");

  // Save our own tokens so we can come back
  sessionStorage.setItem(RETURN_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));

  // Become the target user
  const { error } = await supabase.auth.verifyOtp({
    token_hash: json.token_hash,
    type: "magiclink",
  });
  if (error) {
    sessionStorage.removeItem(RETURN_KEY);
    throw new Error(error.message);
  }

  sessionStorage.setItem(ACTING_KEY, json.email);
  window.location.href = "/dashboard";
}

// Are we currently impersonating?
export function impersonationTarget(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACTING_KEY);
}

// Return to the original (admin/parent) account.
export async function stopImpersonation(): Promise<void> {
  const raw = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(ACTING_KEY);
  sessionStorage.removeItem(RETURN_KEY);

  if (raw) {
    try {
      const { access_token, refresh_token } = JSON.parse(raw);
      await supabase.auth.setSession({ access_token, refresh_token });
      window.location.href = "/admin";
      return;
    } catch {
      /* fall through to sign-out */
    }
  }
  // No stored session — safest is to sign out
  await supabase.auth.signOut();
  window.location.href = "/";
}
