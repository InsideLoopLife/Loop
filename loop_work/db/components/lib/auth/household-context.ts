export type HouseholdMembership = {
  id?: string | null;
  household_id: string | null;
  role?: string | null;
  permission_tier?: string | null;
  can_manage_people?: boolean | null;
  can_manage_child_profiles?: boolean | null;
  can_view_household_income?: boolean | null;
  can_manage_household_costs?: boolean | null;
  can_manage_integrations?: boolean | null;
  app_households?: { owner_user_id?: string | null; id?: string | null } | null;
};

export type HouseholdContext = {
  userId: string;
  householdId: string | null;
  dataOwnerUserId: string | null;
  membership: HouseholdMembership | null;
  isOwnerOrAdmin: boolean;
};

type SupabaseLike = {
  from: (table: string) => any;
};

type UserLike = { id: string } | string;

function userIdFrom(user: UserLike) {
  return typeof user === "string" ? user : user.id;
}

export async function getActiveHouseholdContext(supabase: SupabaseLike, user: UserLike): Promise<HouseholdContext> {
  const userId = userIdFrom(user);

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("app_user_profiles").select("household_id").eq("user_id", userId).maybeSingle(),
    supabase
      .from("app_household_members")
      .select("id, household_id, role, permission_tier, can_manage_people, can_manage_child_profiles, can_view_household_income, can_manage_household_costs, can_manage_integrations, app_households(id, owner_user_id)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);

  const rows = (memberships || []) as HouseholdMembership[];
  const preferredHouseholdId = profile?.household_id || null;
  const membership = rows.find((row) => row.household_id === preferredHouseholdId) || rows[0] || null;
  const householdId = membership?.household_id || null;
  const ownerUserId = membership?.app_households?.owner_user_id || null;
  const permissionTier = String(membership?.permission_tier || membership?.role || "").toLowerCase();

  return {
    userId,
    householdId,
    dataOwnerUserId: ownerUserId || userId,
    membership,
    isOwnerOrAdmin: permissionTier === "owner" || permissionTier === "admin",
  };
}

export function visibleDataOrFilter(ctx: Pick<HouseholdContext, "userId" | "householdId">) {
  if (!ctx.householdId) return `user_id.eq.${ctx.userId}`;
  return `user_id.eq.${ctx.userId},and(household_id.eq.${ctx.householdId},visibility_scope.eq.household)`;
}

export function applyVisibleDataFilter<T extends { eq: (column: string, value: string) => T; or: (filters: string) => T }>(
  query: T,
  ctx: Pick<HouseholdContext, "userId" | "householdId">
): T {
  if (!ctx.householdId) return query.eq("user_id", ctx.userId);
  return query.or(visibleDataOrFilter(ctx));
}

export function householdWriteFields(ctx: Pick<HouseholdContext, "householdId">, userId: string, visibility: "private" | "household" = "household") {
  return {
    user_id: userId,
    owner_user_id: userId,
    created_by_user_id: userId,
    household_id: ctx.householdId,
    visibility_scope: ctx.householdId ? visibility : "private",
  };
}

export function applyMutableRecordFilter<T extends { eq: (column: string, value: string) => T; or: (filters: string) => T }>(
  query: T,
  id: string,
  ctx: Pick<HouseholdContext, "userId" | "householdId">
): T {
  const byId = query.eq("id", id);
  if (!ctx.householdId) return byId.eq("user_id", ctx.userId);
  return byId.or(visibleDataOrFilter(ctx));
}
