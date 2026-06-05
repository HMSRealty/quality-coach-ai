// lib/supabase/browser.ts
// Cookie-aware browser client (SSR-compatible). Use this in client components
// once the auth cutover (docs/CRM_ARCHITECTURE.md) is done so the session lives
// in cookies the middleware can read. Until then, lib/supabase.ts stays in use.
import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
