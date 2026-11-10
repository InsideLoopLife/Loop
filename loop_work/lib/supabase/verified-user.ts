import type { User } from "@supabase/supabase-js";

/**
 * The signed-in user for a page render, checked against the project's signing
 * key locally (the token is ES256-signed and the key set is cached), instead
 * of asking the Auth server on every page. That call crossed the Atlantic and
 * took 0.3–1.9s per page. Falls back to getUser() if the token can't be read.
 * Server actions that change data still use getUser().
 */
export async function getVerifiedUser(supabase: { auth: any }): Promise<{ data: { user: User | null }; error: unknown }> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims?.sub) {
      const user = {
        id: String(claims.sub),
        email: claims.email ?? undefined,
        phone: claims.phone ?? undefined,
        role: claims.role,
        aud: claims.aud,
        app_metadata: claims.app_metadata ?? {},
        user_metadata: claims.user_metadata ?? {},
        is_anonymous: Boolean(claims.is_anonymous),
        created_at: "",
      } as unknown as User;
      return { data: { user }, error: null };
    }
  } catch {
    // fall through to the network check
  }
  return supabase.auth.getUser();
}
