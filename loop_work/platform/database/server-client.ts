import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createCachingFetch } from "@/platform/database/query-cache";

/**
 * User-scoped server client. This client carries the signed-in user's session
 * and remains subject to Supabase RLS policies.
 *
 * Reads go through the change-aware cache in ./query-cache: an identical read for the same verified
 * person is answered from memory until any table it depends on changes.
 */
export async function createServerDatabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const cookieStore = await cookies();

  // The cache verifies each access token before serving a cached answer; it uses this client's own
  // JWT verification (signing keys are cached, so this is normally local).
  const holder: { client: ReturnType<typeof createServerClient> | null } = { client: null };
  const cachingFetch = createCachingFetch({
    supabaseUrl,
    verify: async (token) => {
      if (!holder.client) return null;
      const { data, error } = await holder.client.auth.getClaims(token);
      const claims = data?.claims;
      if (error || !claims?.sub || claims.role !== "authenticated") return null;
      return { sub: String(claims.sub), exp: Number(claims.exp || 0) };
    },
  });

  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // Server Components cannot always set cookies. Middleware refreshes sessions.
        }
      },
    },
    global: { fetch: cachingFetch },
  });
  holder.client = client;
  return client;
}

// Compatibility alias for existing server modules.
export const createClient = createServerDatabaseClient;
