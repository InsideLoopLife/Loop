import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/platform/database/admin-client";

/**
 * Resolve profile avatars behind the identity boundary. Callers never receive a
 * privileged client and cannot use this helper for arbitrary profile reads.
 */
export async function getLinkedProfileAvatarMap(
  userScopedClient: any,
  linkedUserIds: string[],
): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(linkedUserIds.filter(Boolean)));
  if (!ids.length) return new Map();

  const client = hasSupabaseAdminKey()
    ? createAdminClient()
    : userScopedClient;
  const { data } = await client
    .from("app_user_profiles")
    .select("user_id,avatar_url")
    .in("user_id", ids);

  return new Map(
    (data || []).map((profile: any) => [
      String(profile.user_id),
      profile.avatar_url ? String(profile.avatar_url) : null,
    ]),
  );
}
