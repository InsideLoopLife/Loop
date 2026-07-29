import crypto from "crypto";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

type LinkResult = {
  personInvitesPending: number;
  householdInvitesPending: number;
  notificationsCreated: number;
};

function normaliseEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}


async function activeHouseholdIdsForUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) {
    console.warn("[invite-linking] active household lookup failed", error.message);
    return new Set<string>();
  }
  return new Set((data || []).map((row: any) => String(row.household_id || "")).filter(Boolean));
}

async function clearInviteNotificationsForHousehold(admin: ReturnType<typeof createAdminClient>, userId: string, householdId?: string | null) {
  if (!householdId) return;
  const { error } = await admin
    .from("app_notifications")
    .update({ status: "dismissed", action_status: "not_applicable", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .eq("notification_type", "household_invite")
    .neq("status", "dismissed");
  if (error) console.warn("[invite-linking] stale invite notification cleanup failed", error.message);
}

async function getHouseholdName(admin: ReturnType<typeof createAdminClient>, householdId: string | null | undefined) {
  if (!householdId) return "the household";
  const { data } = await admin.from("app_households").select("name").eq("id", householdId).maybeSingle();
  return data?.name || "the household";
}

async function notificationExists(admin: ReturnType<typeof createAdminClient>, userId: string, href: string) {
  const { data } = await admin
    .from("app_notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("notification_type", "household_invite")
    .eq("cta_href", href)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function addNotification(admin: ReturnType<typeof createAdminClient>, args: {
  userId: string;
  householdId?: string | null;
  title: string;
  body: string;
  href: string;
}) {
  if (await notificationExists(admin, args.userId, args.href)) return 0;
  const { error } = await admin.from("app_notifications").insert({
    user_id: args.userId,
    household_id: args.householdId || null,
    notification_type: "household_invite",
    category: "household",
    channel: "in_app",
    action_status: "pending",
    severity: "info",
    status: "unread",
    title: args.title,
    body: args.body,
    cta_label: "Review invite",
    cta_href: args.href,
  });

  if (error) console.warn("[invite-linking] notification skipped", error.message);
  return error ? 0 : 1;
}

// This intentionally DOES NOT auto-accept invites. It only surfaces pending invites.
// The user must explicitly accept so adult privacy/visibility is not silently changed.
export async function processPendingHouseholdLinksForUser(args: { userId: string; email?: string | null }): Promise<LinkResult> {
  const email = normaliseEmail(args.email);
  const result: LinkResult = { personInvitesPending: 0, householdInvitesPending: 0, notificationsCreated: 0 };
  if (!email || !hasSupabaseAdminKey()) return result;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.warn("[invite-linking] Supabase admin key invalid; skipping passive invite surfacing", error);
    return result;
  }
  const now = new Date().toISOString();
  const emailHash = sha256(email);
  const activeHouseholdIds = await activeHouseholdIdsForUser(admin, args.userId);

  const { data: personInvites, error: personInviteError } = await admin
    .from("person_account_invites")
    .select("id, household_id, person_id, email, status, expires_at")
    .eq("status", "pending")
    .eq("email", email)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (personInviteError) console.warn("[invite-linking] person invite lookup failed", personInviteError.message);

  for (const invite of personInvites || []) {
    if (invite.household_id && activeHouseholdIds.has(String(invite.household_id))) {
      await clearInviteNotificationsForHousehold(admin, args.userId, invite.household_id);
      continue;
    }
    const householdName = await getHouseholdName(admin, invite.household_id);
    result.personInvitesPending += 1;
    result.notificationsCreated += await addNotification(admin, {
      userId: args.userId,
      householdId: invite.household_id,
      title: `Claim your ${householdName} profile`,
      body: "A household profile has been prepared for this email address. Review it before linking your account.",
      href: `/accept-invite?invite=${invite.id}`,
    });
  }

  const byEmail = await admin
    .from("household_join_invites")
    .select("id, household_id, invited_email, role, permission_tier, expires_at")
    .eq("status", "pending")
    .eq("invited_email", email)
    .gt("expires_at", now);
  const byHash = await admin
    .from("household_join_invites")
    .select("id, household_id, invited_email, role, permission_tier, expires_at")
    .eq("status", "pending")
    .eq("invited_email_hash", emailHash)
    .gt("expires_at", now);

  if (byEmail.error) console.warn("[invite-linking] household invite email lookup failed", byEmail.error.message);
  if (byHash.error) console.warn("[invite-linking] household invite hash lookup failed", byHash.error.message);

  const inviteMap = new Map<string, any>();
  for (const invite of byEmail.data || []) inviteMap.set(invite.id, invite);
  for (const invite of byHash.data || []) inviteMap.set(invite.id, invite);

  for (const invite of Array.from(inviteMap.values())) {
    if (invite.household_id && activeHouseholdIds.has(String(invite.household_id))) {
      await clearInviteNotificationsForHousehold(admin, args.userId, invite.household_id);
      continue;
    }
    const householdName = await getHouseholdName(admin, invite.household_id);
    result.householdInvitesPending += 1;
    result.notificationsCreated += await addNotification(admin, {
      userId: args.userId,
      householdId: invite.household_id,
      title: `Invite to join ${householdName}`,
      body: `You have been invited as ${invite.permission_tier || invite.role || "member"}. Accepting will add this household to your account without exposing your private data by default.`,
      href: `/household/join?invite=${invite.id}`,
    });
  }

  console.log("[invite-linking] surfaced pending invites", { email, ...result });
  return result;
}
