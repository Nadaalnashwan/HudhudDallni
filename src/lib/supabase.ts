import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * One place for Supabase config. Only the publishable (anon-role) key is used —
 * all access is governed by RLS. Never put a service-role key here.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const DB_SCHEMA = "hudhud_demo";

export const supabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

type DemoClient = SupabaseClient<any, typeof DB_SCHEMA, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let browserClient: DemoClient | null = null;
let serverClient: DemoClient | null = null;

/** Browser client: keeps the (anonymous) auth session so RLS can tie rows to auth.uid(). */
export function getBrowserSupabase(): DemoClient | null {
  if (!supabaseConfigured()) return null;
  return (browserClient ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, { db: { schema: DB_SCHEMA } }));
}

/** Server client for public reads (places). No session, anon role. */
export function getServerSupabase(): DemoClient | null {
  if (!supabaseConfigured()) return null;
  return (serverClient ??= createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
