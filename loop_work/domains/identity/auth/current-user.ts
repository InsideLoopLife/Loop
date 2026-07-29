import { redirect } from "next/navigation";
import { createServerDatabaseClient } from "@/platform/database/server-client";

export type SignedInUserContext = Awaited<ReturnType<typeof requireSignedInUser>>;

/** Require a signed-in user and return the user-scoped RLS client. */
export async function requireSignedInUser(redirectTo = "/login") {
  const supabase = await createServerDatabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect(redirectTo);

  return { supabase, user };
}
