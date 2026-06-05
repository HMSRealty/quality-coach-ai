// lib/supabase/server.ts
// Cookie-based Supabase client for Server Components / Route Handlers (App Router).
// Part of the staged move from localStorage sessions -> SSR cookie sessions
// (required for real middleware route protection). NOT yet wired into the live
// app — see middleware.ts.example and docs/CRM_ARCHITECTURE.md "Auth cutover".
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies(); // Next 15: cookies() is async

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component (read-only cookies) — the refreshed
            // session is persisted by the middleware instead. Safe to ignore.
          }
        },
      },
    },
  );
}
