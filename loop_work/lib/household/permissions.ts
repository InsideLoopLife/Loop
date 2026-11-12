// Who can change a bill, pay or account – the same rules the database uses
// (see supabase/migrations/202611121400_household_ownership.sql), so the app
// can show a lock instead of a button that would quietly do nothing.

export type ShareContext = {
  me: string;
  householdId: string | null;
  myTier: string;
  /** Each member's sharing level: private | view | edit. */
  shareByUser: Record<string, string>;
  /** Names to explain whose something is. */
  nameByUser: Record<string, string>;
  people: Record<string, { linked_user_id?: string | null; relationship?: string | null }>;
};

export type OwnedRow = { user_id?: string | null; household_id?: string | null; visibility_scope?: string | null; person_id?: string | null };

const EDITOR_TIERS = ["owner", "admin", "parent_admin"];

export function canChange(ctx: ShareContext | null | undefined, row: OwnedRow, personColumn: "person_id" | "child_id" = "person_id"): boolean {
  if (!ctx) return true;
  const creator = row.user_id || null;
  if (!creator || creator === ctx.me) return true;
  const personId = (row as any)[personColumn] as string | null | undefined;
  const person = personId ? ctx.people[personId] : undefined;
  if (person?.linked_user_id && person.linked_user_id === ctx.me) return true;
  if (!row.household_id || row.household_id !== ctx.householdId || (row.visibility_scope || "private") !== "household") return false;
  const level = ctx.shareByUser[creator];
  if (!level || level === "private") return false;
  if (person?.relationship === "child" && [...EDITOR_TIERS, "parent"].includes(ctx.myTier)) return true;
  return level === "edit" && EDITOR_TIERS.includes(ctx.myTier);
}

/** "Beth's – view only" style note for something you can't change. */
export function lockNote(ctx: ShareContext | null | undefined, row: OwnedRow) {
  if (!ctx || !row.user_id) return null;
  const name = ctx.nameByUser[row.user_id] || "Someone else";
  return `${name} added this and keeps it view-only`;
}

/** Load the sharing rules for the signed-in person's household. */
export async function loadShareContext(supabase: any, ctx: { userId: string; householdId: string | null; permissionTier?: string | null }): Promise<ShareContext> {
  const base: ShareContext = { me: ctx.userId, householdId: ctx.householdId, myTier: ctx.permissionTier || "member", shareByUser: {}, nameByUser: {}, people: {} };
  if (!ctx.householdId) return base;
  const [{ data: members }, { data: people }] = await Promise.all([
    supabase.from("app_household_members").select("user_id, permission_tier, role, share_level, email").eq("household_id", ctx.householdId).eq("status", "active"),
    supabase.from("people").select("id, name, linked_user_id, relationship").eq("household_id", ctx.householdId),
  ]);
  for (const m of (members || []) as any[]) {
    base.shareByUser[m.user_id] = m.share_level || "view";
    if (m.user_id === ctx.userId) base.myTier = m.permission_tier || m.role || base.myTier;
    if (m.email) base.nameByUser[m.user_id] = String(m.email).split("@")[0];
  }
  for (const p of (people || []) as any[]) {
    base.people[p.id] = { linked_user_id: p.linked_user_id, relationship: p.relationship };
    if (p.linked_user_id && p.name) base.nameByUser[p.linked_user_id] = p.name;
  }
  return base;
}
