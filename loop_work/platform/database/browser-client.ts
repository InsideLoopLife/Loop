import { createBrowserClient } from "@supabase/ssr";

/** Browser-only, user-scoped client. Never use a privileged key here. */
export function createBrowserDatabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const createClient = createBrowserDatabaseClient;
