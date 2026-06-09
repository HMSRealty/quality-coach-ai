import { createClient } from '@supabase/supabase-js';

// Fallback to a placeholder during static build so the module initialises
// without throwing — all pages that use Supabase are force-dynamic anyway.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);