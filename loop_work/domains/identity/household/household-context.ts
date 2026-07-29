type SupabaseLike = any;

export type ActiveHouseholdContext = {
  userId: string;
  householdId: string | null;
  householdName: string | null;
  dataOwnerUserId: string;
  role: string;
  permissionTier: string;
  isOwnerOrAdmin: boolean;
  canManagePeople: boolean;
  canViewHouseholdIncome: boolean;
  memberUserIds: string[];
};

const ownerAdminTiers = new Set(["owner", "admin", "parent", "parent_admin"]);

function fallbackContext(userId: string): ActiveHouseholdContext {
  return {
    userId,
    householdId: null,
    householdName: null,
    dataOwnerUserId: userId,
    role: "owner",
    permissionTier: "owner",
    isOwnerOrAdmin: true,
    canManagePeople: true,
    canViewHouseholdIncome: true,
    memberUserIds: [userId],
  };
}

export async function getActiveHouseholdContext(supabase: SupabaseLike, user: { id: string; email?: string | null }): Promise<ActiveHouseholdContext> {
  const client = supabase;

  const { data: profile } = await client
    .from("app_user_profiles")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let membershipQuery = client
    .from("app_household_members")
    .select("household_id, role, permission_tier, can_manage_people, can_view_household_income")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (profile?.household_id) membershipQuery = membershipQuery.eq("household_id", profile.household_id);

  let { data: membership } = await membershipQuery
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership?.household_id && profile?.household_id) {
    const fallback = await client
      .from("app_household_members")
      .select("household_id, role, permission_tier, can_manage_people, can_view_household_income")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    membership = fallback.data;
  }

  if (!membership?.household_id) {
    return fallbackContext(user.id);
  }

  const { data: household } = await client
    .from("app_households")
    .select("id, name, owner_user_id, status")
    .eq("id", membership.household_id)
    .neq("status", "deleted")
    .maybeSingle();

  if (!household?.id) {
    return fallbackContext(user.id);
  }

  const { data: allMembers } = await client
    .from("app_household_members")
    .select("user_id")
    .eq("household_id", membership.household_id)
    .eq("status", "active");

  const memberUserIds = Array.from(new Set([
    ...(allMembers || []).map((member: any) => String(member.user_id || "")).filter(Boolean),
    household?.owner_user_id || user.id,
    user.id,
  ]));

  const permissionTier = membership.permission_tier || "member";
  const role = membership.role || "member";
  const isOwnerOrAdmin = ownerAdminTiers.has(permissionTier) || ["owner", "admin"].includes(role);

  return {
    userId: user.id,
    householdId: membership.household_id,
    householdName: household?.name || null,
    dataOwnerUserId: household?.owner_user_id || user.id,
    role,
    permissionTier,
    isOwnerOrAdmin,
    canManagePeople: Boolean(membership.can_manage_people || ownerAdminTiers.has(permissionTier)),
    canViewHouseholdIncome: Boolean(membership.can_view_household_income || isOwnerOrAdmin),
    memberUserIds,
  };
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function pgInList(values: string[]) {
  return values.map((value) => `"${value.replaceAll('"', '')}"`).join(",");
}

export function visibleDataOrFilter(ctx: Pick<ActiveHouseholdContext, "userId" | "dataOwnerUserId" | "householdId">): string {
  const userId = ctx.userId || ctx.dataOwnerUserId;
  if (!ctx.householdId) return `user_id.eq.${userId}`;
  return `user_id.eq.${userId},and(household_id.eq.${ctx.householdId},visibility_scope.eq.household)`;
}

export function householdMemberDataOrFilter(ctx: Pick<ActiveHouseholdContext, "userId" | "dataOwnerUserId" | "householdId" | "memberUserIds">): string {
  const userId = ctx.userId || ctx.dataOwnerUserId;
  const memberUserIds = uniqueIds([...(ctx.memberUserIds || []), userId, ctx.dataOwnerUserId]);
  if (!ctx.householdId) return `user_id.eq.${userId}`;
  const parts = [
    `user_id.eq.${userId}`,
    `and(household_id.eq.${ctx.householdId},visibility_scope.eq.household)`,
  ];
  if (memberUserIds.length > 1) parts.push(`user_id.in.(${pgInList(memberUserIds)})`);
  return parts.join(",");
}

export function householdPeopleOrFilter(ctx: Pick<ActiveHouseholdContext, "userId" | "dataOwnerUserId" | "householdId" | "memberUserIds">): string {
  const userId = ctx.userId || ctx.dataOwnerUserId;
  const memberUserIds = uniqueIds([...(ctx.memberUserIds || []), userId, ctx.dataOwnerUserId]);
  if (!ctx.householdId) return `user_id.eq.${userId}`;
  const parts = [
    `user_id.eq.${userId}`,
    `household_id.eq.${ctx.householdId}`,
  ];
  if (memberUserIds.length > 1) {
    const list = pgInList(memberUserIds);
    parts.push(`user_id.in.(${list})`);
    parts.push(`linked_user_id.in.(${list})`);
  }
  return parts.join(",");
}

export function applyVisibleDataFilter<T extends { or: (filter: string) => T }>(query: T, ctx: Pick<ActiveHouseholdContext, "userId" | "dataOwnerUserId" | "householdId">): T {
  return query.or(visibleDataOrFilter(ctx));
}

export function householdWriteFields(ctx: ActiveHouseholdContext, userId: string, visibility: "private" | "household" = "household") {
  return {
    user_id: userId,
    owner_user_id: userId,
    created_by_user_id: userId,
    household_id: ctx.householdId,
    visibility_scope: ctx.householdId ? visibility : "private",
  };
}

export function applyMutableRecordFilter<T extends { eq: (column: string, value: any) => T; or: (filter: string) => T }>(query: T, id: string, ctx: ActiveHouseholdContext): T {
  let scoped = query.eq("id", id);
  if (ctx.householdId && ctx.isOwnerOrAdmin) {
    return scoped.or(`user_id.eq.${ctx.userId},and(household_id.eq.${ctx.householdId},visibility_scope.eq.household)`);
  }
  return scoped.eq("user_id", ctx.userId);
}

export type HouseholdPersonIdentity = {
  id: string;
  user_id?: string | null;
  linked_user_id?: string | null;
  email?: string | null;
  invite_email?: string | null;
  name?: string | null;
  relationship?: string | null;
  birth_date?: string | null;
  account_status?: string | null;
  active_until?: string | null;
};

function normaliseName(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function personDedupeKey(person: HouseholdPersonIdentity) {
  const relationship = String(person.relationship || "other").toLowerCase();
  const name = normaliseName(person.name);
  if (relationship === "child" && name) return `child:${name}:${person.birth_date || "unknown"}`;
  if (name && ["self", "partner", "adult", "other"].includes(relationship)) return `adult:${relationship}:${name}`;
  if (person.linked_user_id) return `linked:${person.linked_user_id}`;
  const email = String(person.email || person.invite_email || "").trim().toLowerCase();
  if (email) return `email:${email}`;
  return `id:${person.id}`;
}

function rankPerson(person: HouseholdPersonIdentity, preferredUserId?: string | null) {
  let rank = 100;
  if (person.active_until || person.account_status === "duplicate_merged") rank += 1000;
  if (person.linked_user_id) rank -= 30;
  if (preferredUserId && (person.user_id === preferredUserId || person.linked_user_id === preferredUserId)) rank -= 20;
  if (person.relationship === "self") rank -= 10;
  if (person.relationship === "partner") rank -= 8;
  if (person.relationship === "child") rank -= 5;
  if (person.email || person.invite_email) rank -= 2;
  return rank;
}

export function dedupeHouseholdPeople<T extends HouseholdPersonIdentity>(people: T[], preferredUserId?: string | null): T[] {
  const byKey = new Map<string, T>();
  for (const person of people) {
    if (person.active_until || person.account_status === "duplicate_merged") continue;
    const key = personDedupeKey(person);
    const existing = byKey.get(key);
    if (!existing || rankPerson(person, preferredUserId) < rankPerson(existing, preferredUserId)) byKey.set(key, person);
  }
  return Array.from(byKey.values());
}
