"use server";

import crypto from "crypto";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/notifications/send";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSignedInUser } from "@/domains/identity/auth";
import { getSnapTradeSecretForUser } from "@/lib/snaptrade/sync";
import { loopSnapTradeUserId, snapTradeRequest } from "@/lib/snaptrade/client";

async function requireUser() {
  return requireSignedInUser();
}

function adminOrUserClient<T>(fallback: T): T {
  if (!hasSupabaseAdminKey()) return fallback;
  try {
    return createAdminClient() as T;
  } catch {
    return fallback;
  }
}

async function getHouseholdId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.household_id) {
    const { data: activeMembership } = await supabase
      .from("app_household_members")
      .select("household_id")
      .eq("user_id", userId)
      .eq("household_id", profile.household_id)
      .eq("status", "active")
      .maybeSingle();
    if (activeMembership?.household_id) return activeMembership.household_id;
  }

  const { data } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.household_id || null;
}

async function getOrCreateHouseholdId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null },
  defaults?: { name?: string; timezone?: string; currency?: string }
) {
  const existing = await getHouseholdId(supabase, user.id);
  if (existing) return existing;

  const { data: householdId, error: rpcError } = await supabase.rpc("app_get_or_create_household", {
    p_name: defaults?.name || "My household",
    p_timezone: defaults?.timezone || "Europe/London",
    p_currency: defaults?.currency || "GBP",
    p_image_url: null,
  });
  if (rpcError) throw new Error(`${rpcError.message}. Run db/v27_48_household_rpc_wealth_nutrition_fix.sql in Supabase.`);
  if (!householdId) throw new Error("Could not create household.");
  return householdId;
}

async function syncSelfPersonWithAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string | null },
  profile: { full_name?: string | null; display_name?: string | null; avatar_url?: string | null }
) {
  const email = (user.email || "").toLowerCase();
  const name = profile.full_name || profile.display_name || (user.email ? user.email.split("@")[0] : "Me");
  const householdId = await getHouseholdId(supabase, user.id);

  const { data: existingSelf } = await supabase
    .from("people")
    .select("id, avatar_url, email, name")
    .eq("user_id", user.id)
    .or(`linked_user_id.eq.${user.id},relationship.eq.self${email ? `,email.ilike.${email}` : ""}`)
    .order("relationship", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSelf?.id) {
    await supabase
      .from("people")
      .update({
        linked_user_id: user.id,
        household_id: householdId,
        owner_user_id: user.id,
        visibility_scope: householdId ? "household" : "private",
        email: user.email || existingSelf.email || null,
        invite_email: user.email || existingSelf.email || null,
        account_status: "linked",
        name: existingSelf.name || name,
        avatar_url: profile.avatar_url || existingSelf.avatar_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingSelf.id)
      .eq("user_id", user.id);
    return;
  }

  await supabase.from("people").insert({
    user_id: user.id,
    owner_user_id: user.id,
    created_by_user_id: user.id,
    household_id: householdId,
    visibility_scope: householdId ? "household" : "private",
    linked_user_id: user.id,
    name,
    relationship: "self",
    email: user.email || null,
    invite_email: user.email || null,
    account_status: "linked",
    avatar_url: profile.avatar_url || null,
    income_visible_to_household: true,
    costs_visible_to_household: true,
    household_can_add_costs: true,
    active_from: new Date().toISOString().slice(0, 10),
  });
}

export async function saveAccountProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const displayName = String(formData.get("display_name") || "").trim();
  const timezone = String(formData.get("timezone") || "Europe/London").trim();
  const currency = String(formData.get("currency") || "GBP").trim().toUpperCase();
  const dateDisplayFormat = String(formData.get("date_display_format") || "age_and_date");
  const defaultPersonImageMode = String(formData.get("default_person_image_mode") || "avatar_url");
  const spendingPersonDisplayMode = String(formData.get("spending_person_display_mode") || "both");
  const spendingDateFormat = String(formData.get("spending_date_format") || "day_month_ordinal");
  const spendingBillLogoMode = String(formData.get("spending_bill_logo_mode") || "auto");
  const moneyDisplayPrecision = String(formData.get("money_display_precision") || "exact");
  const dashboardHomeView = String(formData.get("dashboard_home_view") || "breakdown");
  const householdId = await getOrCreateHouseholdId(supabase, user, { timezone, currency });

  const { error } = await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    household_id: householdId,
    display_name: displayName || null,
    email: user.email || null,
    timezone,
    currency,
    date_display_format: dateDisplayFormat,
    default_person_image_mode: defaultPersonImageMode,
    spending_person_display_mode: spendingPersonDisplayMode,
    spending_date_format: spendingDateFormat,
    spending_bill_logo_mode: spendingBillLogoMode,
    money_display_precision: moneyDisplayPrecision,
    dashboard_home_view: dashboardHomeView,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  await syncSelfPersonWithAccount(supabase, user, { display_name: displayName || null });

  if (householdId) {
    await supabase
      .from("app_households")
      .update({ timezone, currency, updated_at: new Date().toISOString() })
      .eq("id", householdId)
      .eq("owner_user_id", user.id);
  }

  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "account_profile_updated",
    status: "success",
    metadata: { changed: ["display_name", "timezone", "currency", "date_display_format", "default_person_image_mode", "spending_person_display_mode", "spending_date_format", "spending_bill_logo_mode", "money_display_precision", "dashboard_home_view"] },
  });

  revalidatePath("/account");
}

export async function saveNotificationPreferences(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getHouseholdId(supabase, user.id);

  const payload = {
    user_id: user.id,
    household_id: householdId,
    finance_digest_enabled: formData.get("finance_digest_enabled") === "on",
    health_digest_enabled: formData.get("health_digest_enabled") === "on",
    renewal_reminders_enabled: formData.get("renewal_reminders_enabled") === "on",
    weekly_email_enabled: formData.get("weekly_email_enabled") === "on",
    monthly_email_enabled: formData.get("monthly_email_enabled") === "on",
    in_app_enabled: formData.get("in_app_enabled") === "on",
    push_notifications_enabled: formData.get("push_notifications_enabled") === "on",
    preferred_send_day: String(formData.get("preferred_send_day") || "Monday"),
    preferred_send_time: String(formData.get("preferred_send_time") || "08:00"),
    quiet_hours_start: String(formData.get("quiet_hours_start") || "21:00"),
    quiet_hours_end: String(formData.get("quiet_hours_end") || "07:00"),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("app_notification_preferences").upsert(payload, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "notification_preferences_updated",
    status: "success",
    metadata: { weekly: payload.weekly_email_enabled, monthly: payload.monthly_email_enabled },
  });

  revalidatePath("/account");
}


async function findAuthUserByEmailForAccount(email: string) {
  if (!hasSupabaseAdminKey()) return null;
  const admin = createAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

function eightDigitCode() {
  return String(crypto.randomInt(0, 100_000_000)).padStart(8, "0");
}

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function recoveryRedirectUrl() {
  const callback = new URL("/auth/callback", baseUrl());
  callback.searchParams.set("next", "/account/update-password");
  return callback.toString();
}

export async function sendPasswordResetEmail() {
  const { supabase, user } = await requireUser();
  if (!user.email) throw new Error("No email is attached to this account.");

  const email = user.email.trim().toLowerCase();
  if (!hasSupabaseAdminKey()) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectUrl(),
    });
    if (error) throw new Error(error.message);
    await supabase.from("app_security_events").insert({
      user_id: user.id,
      event_type: "password_reset_recovery_link_requested",
      status: "success",
      metadata: { source: "account_page", sent_via: "supabase_native_recovery_link" },
    });
    revalidatePath("/account");
    return;
  }

  const authUser = await findAuthUserByEmailForAccount(email);
  if (!authUser) throw new Error("Could not locate the current auth user.");

  const code = eightDigitCode();
  const emailHash = crypto.createHash("sha256").update(email).digest("hex");
  const codeHash = crypto.createHash("sha256").update(`${email}:${code}`).digest("hex");
  const { error: codeError } = await createAdminClient().from("auth_action_codes").insert({
    purpose: "password_reset",
    email,
    email_hash: emailHash,
    code_hash: codeHash,
    user_id: authUser.id,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    metadata: { source: "account_page", length: 8 },
  });
  if (codeError) throw new Error(codeError.message);

  const result = await sendTransactionalEmail({
    to: email,
    subject: "Your Loop password reset code",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Reset your Loop password</h2><p>Your 8 digit reset code is:</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes.</p><p>Enter the code at ${process.env.APP_BASE_URL || "http://localhost:3000"}/reset-password/verify?email=${encodeURIComponent(email)}</p></div>`,
    text: `Reset your Loop password

Your 8 digit reset code is: ${code}

This code expires in 10 minutes. Enter it at ${process.env.APP_BASE_URL || "http://localhost:3000"}/reset-password/verify?email=${encodeURIComponent(email)}`,
  });

  await supabase.from("app_security_events").insert({
    user_id: user.id,
    event_type: "password_reset_code_requested",
    status: result.sent ? "success" : "warning",
    metadata: { source: "account_page", provider: result.provider, skipped: result.skipped },
  });

  revalidatePath("/account");
}

async function accountAvatarUrlFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
  fallback: string | null = null
) {
  const file = formData.get("profile_image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Profile image must be an image file.");
    if (file.size > 5_000_000) throw new Error("Profile image must be under 5MB.");
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("user-avatars")
      .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (!uploadError) {
      const { data } = supabase.storage.from("user-avatars").getPublicUrl(path);
      return data.publicUrl;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString("base64")}`;
  }
  return fallback;
}

async function householdImageUrlFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData,
  fallback: string | null = null
) {
  const file = formData.get("household_image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Household image must be an image file.");
    if (file.size > 5_000_000) throw new Error("Household image must be under 5MB.");
    const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const path = `${userId}/households/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("household-images")
      .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (!uploadError) {
      const { data } = supabase.storage.from("household-images").getPublicUrl(path);
      return data.publicUrl;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString("base64")}`;
  }
  return fallback;
}

export async function saveHouseholdSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("household_name") || "").trim() || "Household";
  const currency = String(formData.get("currency") || "GBP").trim().toUpperCase();
  const timezone = String(formData.get("timezone") || "Europe/London").trim();
  const householdId = await getOrCreateHouseholdId(supabase, user, { name, timezone, currency });
  const existingImage = String(formData.get("existing_household_image_url") || "") || null;
  const imageUrl = await householdImageUrlFromForm(supabase, user.id, formData, existingImage);
  const writeClient = adminOrUserClient(supabase);
  const { error } = await writeClient
    .from("app_households")
    .update({ name, currency, timezone, image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", householdId);
  if (error) throw new Error(error.message);

  // Keep the signed-in user's Self profile attached to their account details, but do not
  // overwrite name/avatar here because household settings should only rename the household.
  await syncSelfPersonWithAccount(supabase, user, {});

  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "household_settings_updated",
    status: "success",
    metadata: { changed: ["name", "currency", "timezone"] },
  });
  revalidatePath("/account");
  revalidatePath("/household");
}

export async function savePersonalIdentityProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getOrCreateHouseholdId(supabase, user);
  const existingAvatar = String(formData.get("existing_avatar_url") || "") || null;
  const avatarUrl = await accountAvatarUrlFromForm(supabase, user.id, formData, existingAvatar);
  const fullName = String(formData.get("full_name") || "").trim();
  const displayName = String(formData.get("display_name") || fullName || "").trim();
  const { error } = await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    household_id: householdId,
    email: user.email || null,
    full_name: fullName || null,
    display_name: displayName || null,
    avatar_url: avatarUrl,
    phone_number: String(formData.get("phone_number") || "").trim() || null,
    timezone: String(formData.get("timezone") || "Europe/London").trim(),
    currency: String(formData.get("currency") || "GBP").trim().toUpperCase(),
    date_display_format: String(formData.get("date_display_format") || "age_and_date"),
    default_person_image_mode: String(formData.get("default_person_image_mode") || "avatar_url"),
    spending_person_display_mode: String(formData.get("spending_person_display_mode") || "both"),
    spending_date_format: String(formData.get("spending_date_format") || "day_month_ordinal"),
    spending_bill_logo_mode: String(formData.get("spending_bill_logo_mode") || "auto"),
    money_display_precision: String(formData.get("money_display_precision") || "exact"),
    dashboard_home_view: String(formData.get("dashboard_home_view") || "breakdown"),
    health_height_cm: Number(formData.get("health_height_cm") || 0) || null,
    health_weight_kg: Number(formData.get("health_weight_kg") || 0) || null,
    health_sex: String(formData.get("health_sex") || "not_set"),
    health_activity_level: String(formData.get("health_activity_level") || "not_set"),
    health_goal: String(formData.get("health_goal") || "general"),
    health_training_load: String(formData.get("health_training_load") || "").trim() || null,
    identity_verification_status: user.email_confirmed_at ? "email_verified" : "unverified",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "identity_profile_updated",
    status: "success",
    metadata: { changed: ["full_name", "display_name", "avatar_url", "phone_number", "financial_flow_settings", "health_baseline"] },
  });
  revalidatePath("/account");
}

export async function saveHouseholdPermissions(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) throw new Error("No active household found.");
  const memberId = String(formData.get("member_id") || "");
  const role = String(formData.get("role") || "member");
  const permissionTier = String(formData.get("permission_tier") || "member");
  if (!memberId) throw new Error("Missing household member id.");
  const { error } = await supabase
    .from("app_household_members")
    .update({
      role,
      permission_tier: permissionTier,
      can_manage_people: formData.get("can_manage_people") === "on",
      can_manage_child_profiles: formData.get("can_manage_child_profiles") === "on",
      can_view_household_income: formData.get("can_view_household_income") === "on",
      can_manage_household_costs: formData.get("can_manage_household_costs") === "on",
      can_manage_integrations: formData.get("can_manage_integrations") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .eq("household_id", householdId);
  if (error) throw new Error(error.message);
  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "household_permissions_updated",
    status: "success",
    metadata: { member_id: memberId, role, permission_tier: permissionTier },
  });
  revalidatePath("/account");
}


export async function saveMyHouseholdSharingPreferences(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) throw new Error("No active household found.");
  const memberId = String(formData.get("member_id") || "");
  if (!memberId) throw new Error("Missing household member id.");
  const { error } = await supabase
    .from("app_household_members")
    .update({
      share_income: formData.get("share_income") === "on",
      share_spending: formData.get("share_spending") === "on",
      share_savings: formData.get("share_savings") === "on",
      share_investments: formData.get("share_investments") === "on",
      share_health_summary: formData.get("share_health_summary") === "on",
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", memberId)
    .eq("household_id", householdId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "household_sharing_preferences_updated",
    status: "success",
    metadata: { member_id: memberId },
  });
  revalidatePath("/account");
  revalidatePath("/financial-flow");
  revalidatePath("/spending");
  revalidatePath("/net-worth");
}

export async function hideHouseholdSharedRecord(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) throw new Error("No active household found.");
  const recordType = String(formData.get("record_type") || "").trim();
  const recordId = String(formData.get("record_id") || "").trim();
  const reason = String(formData.get("reason") || "user_hidden").trim();
  if (!recordType || !recordId) throw new Error("Missing record to hide.");
  const { error } = await supabase.from("app_household_hidden_records").upsert({
    user_id: user.id,
    household_id: householdId,
    record_type: recordType,
    record_id: recordId,
    hidden_by_user_id: user.id,
    hidden_reason: reason || "user_hidden",
    hidden_at: new Date().toISOString(),
  }, { onConflict: "user_id,household_id,record_type,record_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/financial-flow");
  revalidatePath("/spending");
  revalidatePath("/income");
  revalidatePath("/savings");
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

export async function assignChildGuardians(formData: FormData) {
  const { supabase, user } = await requireUser();
  const childId = String(formData.get("child_id") || "");
  if (!childId) throw new Error("Missing child profile id.");
  const guardianIds = formData.getAll("guardian_person_id").map(String).filter(Boolean);
  await supabase.from("person_guardians").delete().eq("child_person_id", childId).eq("user_id", user.id);
  if (guardianIds.length > 0) {
    const { error } = await supabase.from("person_guardians").insert(guardianIds.map((guardianId) => ({
      user_id: user.id,
      child_person_id: childId,
      guardian_person_id: guardianId,
      relationship_type: "parent_guardian",
    })));
    if (error) throw new Error(error.message);
  }
  revalidatePath("/account");
  revalidatePath(`/household/${childId}`);
}


export async function sendAccountTestEmail(formData: FormData) {
  const { supabase, user } = await requireUser();
  const to = String(formData.get("to") || user.email || "").trim();
  if (!to) throw new Error("Add a recipient email address.");
  const result = await sendTransactionalEmail({
    to,
    subject: "Loop email test",
    html: `<p>Hello,</p><p>This is a test email from Loop running locally.</p><p>If you received it, your SMTP/email settings are working.</p>`,
    text: "Hello,\n\nThis is a test email from Loop running locally. If you received it, your SMTP/email settings are working.",
  });
  await supabase.from("app_security_events").insert({
    user_id: user.id,
    event_type: "account_test_email_requested",
    status: result.sent ? "success" : "warning",
    metadata: { provider: result.provider, skipped: result.skipped, to_hash: crypto.createHash("sha256").update(to.toLowerCase()).digest("hex") },
  });
  revalidatePath("/account");
}




async function findAuthUserByEmail(email: string) {
  if (!hasSupabaseAdminKey()) return null;
  const admin = createAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function userCanManageHousehold(client: any, householdId: string, userId: string) {
  const { data } = await client
    .from("app_household_members")
    .select("permission_tier, can_manage_people")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data && (["owner", "admin"].includes(data.permission_tier) || data.can_manage_people));
}

export async function createNewHousehold(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("household_name") || "").trim() || "My household";
  const currency = String(formData.get("currency") || "GBP").trim().toUpperCase();
  const timezone = String(formData.get("timezone") || "Europe/London").trim();
  const imageUrl = await householdImageUrlFromForm(supabase, user.id, formData, null);

  const { error } = await supabase.rpc("app_get_or_create_household", {
    p_name: name,
    p_timezone: timezone,
    p_currency: currency,
    p_image_url: imageUrl || null,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_48_household_rpc_wealth_nutrition_fix.sql in Supabase.`);

  await syncSelfPersonWithAccount(supabase, user, {});
  revalidatePath("/account");
  revalidatePath("/dashboard");
}

export async function switchActiveHousehold(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = String(formData.get("household_id") || "").trim();
  if (!householdId) throw new Error("Missing household id.");
  const { data: member } = await supabase.from("app_household_members").select("id").eq("household_id", householdId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member?.id) throw new Error("You are not an active member of this household.");
  await supabase.from("app_user_profiles").upsert({ user_id: user.id, email: user.email || null, household_id: householdId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/account");
  revalidatePath("/dashboard");
  redirect("/household");
}

export async function createHouseholdShareInvite(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getOrCreateHouseholdId(supabase, user);
  const email = String(formData.get("invite_email") || "").trim().toLowerCase() || null;
  const role = String(formData.get("role") || "member");
  const permissionTier = String(formData.get("permission_tier") || "member");
  const days = Math.max(1, Math.min(60, Number(formData.get("expires_days") || 14)));
  const baseUrl = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

  const { data, error } = await supabase.rpc("app_create_household_invite", {
    p_household_id: householdId,
    p_invited_email: email,
    p_role: role,
    p_permission_tier: permissionTier,
    p_expires_days: days,
    p_base_url: baseUrl,
  });
  if (error) throw new Error(`${error.message}. Run db/v27_48_household_rpc_wealth_nutrition_fix.sql in Supabase.`);

  const invite = Array.isArray(data) ? data[0] : data;
  const link = invite?.join_link || `${baseUrl}/household/join?token=${invite?.raw_token || invite?.short_code || ""}`;
  const householdName = invite?.household_name || "a Loop household";

  if (email) {
    const result = await sendTransactionalEmail({
      to: email,
      subject: `You’ve been invited to join ${householdName}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Join ${householdName}</h2><p>${user.email || "Someone"} invited you to join a Loop household as <strong>${permissionTier}</strong>.</p><p>Your private data stays yours until you choose what to share.</p><p><a href="${link}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700">Review household invite</a></p><p>This link expires in ${days} days.</p></div>`,
      text: `You've been invited to join ${householdName}. Review invite: ${link}. This link expires in ${days} days.`,
    });

    await supabase.from("app_security_events").insert({
      user_id: user.id,
      household_id: householdId,
      event_type: "household_share_invite_email_attempted",
      status: result.sent ? "success" : "warning",
      metadata: { provider: result.provider, skipped: result.skipped, to_hash: crypto.createHash("sha256").update(email).digest("hex") },
    }).then(() => null, () => null);
  }

  await supabase.from("app_security_events").insert({
    user_id: user.id,
    household_id: householdId,
    event_type: "household_share_invite_created",
    status: "success",
    metadata: { email_hash: email ? crypto.createHash("sha256").update(email).digest("hex") : null, role, permission_tier: permissionTier, short_code: invite?.short_code || null, link },
  }).then(() => null, () => null);

  revalidatePath("/account");
}


async function restoreManualAccountsForSnapTradeAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  snaptradeAccountId: string,
) {
  const { data: migrations } = await supabase
    .from("investment_provider_migrations")
    .select("manual_account_id")
    .eq("user_id", userId)
    .eq("snaptrade_account_id", snaptradeAccountId)
    .in("migration_status", ["manual_archived", "manual_archived_after_snaptrade_import"]);

  const manualIds = Array.from(new Set((migrations || []).map((row: any) => row.manual_account_id).filter(Boolean)));
  if (!manualIds.length) return 0;

  await supabase
    .from("investment_accounts")
    .update({
      record_status: "active",
      archive_reason: null,
      archived_at: null,
      superseded_by_account_id: null,
      provider_migration_status: "manual_restored_after_snaptrade_removed",
    })
    .eq("user_id", userId)
    .in("id", manualIds);

  await supabase
    .from("investment_holdings")
    .update({
      record_status: "active",
      archive_reason: null,
      archived_at: null,
      superseded_by_account_id: null,
      provider_migration_status: "manual_restored_after_snaptrade_removed",
    })
    .eq("user_id", userId)
    .in("investment_account_id", manualIds);

  await supabase
    .from("investment_provider_migrations")
    .update({
      migration_status: "manual_restored",
      restored_at: new Date().toISOString(),
      notes: "Manual account restored after SnapTrade account was hidden or connection was removed.",
    })
    .eq("user_id", userId)
    .eq("snaptrade_account_id", snaptradeAccountId)
    .in("migration_status", ["manual_archived", "manual_archived_after_snaptrade_import"]);

  return manualIds.length;
}

export async function hideSnapTradeImportedAccount(formData: FormData) {
  const { supabase, user } = await requireUser();
  const accountId = String(formData.get("account_id") || "").trim();
  if (!accountId) throw new Error("Missing imported account ID.");

  const { data: account, error } = await supabase
    .from("investment_accounts")
    .select("id, label")
    .eq("user_id", user.id)
    .eq("id", accountId)
    .eq("external_provider", "snaptrade")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account) throw new Error("SnapTrade account was not found for this user.");

  await supabase
    .from("investment_holdings")
    .update({
      record_status: "archived",
      archive_reason: "snaptrade_account_hidden_by_user",
      archived_at: new Date().toISOString(),
      provider_migration_status: "snaptrade_hidden_manual_restore_available",
    })
    .eq("user_id", user.id)
    .eq("investment_account_id", accountId)
    .neq("record_status", "archived");

  await supabase
    .from("investment_accounts")
    .update({
      record_status: "archived",
      archive_reason: "snaptrade_account_hidden_by_user",
      archived_at: new Date().toISOString(),
      provider_import_enabled: false,
      provider_migration_status: "snaptrade_hidden_manual_restore_available",
    })
    .eq("user_id", user.id)
    .eq("id", accountId);

  await restoreManualAccountsForSnapTradeAccount(supabase, user.id, accountId);
  revalidatePath("/account");
  revalidatePath("/investments");
}

export async function restoreArchivedManualInvestmentAccount(formData: FormData) {
  const { supabase, user } = await requireUser();
  const accountId = String(formData.get("account_id") || "").trim();
  if (!accountId) throw new Error("Missing manual account ID.");

  const { data: account, error } = await supabase
    .from("investment_accounts")
    .select("id, external_provider")
    .eq("user_id", user.id)
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account) throw new Error("Archived manual account was not found.");
  if (String((account as any).external_provider || "").toLowerCase() === "snaptrade") {
    throw new Error("Use hide imported account for SnapTrade accounts. This restore action is for manual archived records.");
  }

  await supabase
    .from("investment_accounts")
    .update({
      record_status: "active",
      archive_reason: null,
      archived_at: null,
      superseded_by_account_id: null,
      provider_import_enabled: false,
      provider_migration_status: "manual_restored_by_user",
    })
    .eq("user_id", user.id)
    .eq("id", accountId);

  await supabase
    .from("investment_holdings")
    .update({
      record_status: "active",
      archive_reason: null,
      archived_at: null,
      superseded_by_account_id: null,
      provider_migration_status: "manual_restored_by_user",
    })
    .eq("user_id", user.id)
    .eq("investment_account_id", accountId);

  await supabase
    .from("investment_provider_migrations")
    .update({
      migration_status: "manual_restored",
      restored_at: new Date().toISOString(),
      notes: "Manual account restored directly by the user from Account → Integrations.",
    })
    .eq("user_id", user.id)
    .eq("manual_account_id", accountId)
    .in("migration_status", ["manual_archived", "manual_archived_after_snaptrade_import"]);

  revalidatePath("/account");
  revalidatePath("/investments");
}

export async function removeSnapTradeConnectionAndRestoreManual(formData: FormData) {
  const { supabase, user } = await requireUser();
  const localConnectionId = String(formData.get("connection_id") || "").trim();
  const externalConnectionId = String(formData.get("external_connection_id") || "").trim();
  let providerDeleteNote = "Local connection removed.";

  if (externalConnectionId) {
    try {
      const userSecret = await getSnapTradeSecretForUser(supabase, user.id);
      await snapTradeRequest("DELETE", `/connection/${encodeURIComponent(externalConnectionId)}?userId=${encodeURIComponent(loopSnapTradeUserId(user.id))}&userSecret=${encodeURIComponent(userSecret)}`);
      providerDeleteNote = "SnapTrade deletion queued; local imported accounts were archived and manual accounts restored where possible.";
    } catch (error) {
      providerDeleteNote = `Local disconnect completed. SnapTrade deletion did not complete from LOOP: ${error instanceof Error ? error.message : "unknown error"}. The user can also revoke/delete the connection from SnapTrade or the broker.`;
    }
  }

  const accountQuery = supabase
    .from("investment_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("external_provider", "snaptrade");
  const { data: importedAccounts } = externalConnectionId
    ? await accountQuery.eq("external_connection_id", externalConnectionId)
    : await accountQuery;

  for (const account of importedAccounts || []) {
    // BUGFIX (remove-access stuck as "connected"): none of this loop body
    // was wrapped in error handling. If any single account's processing
    // threw, the function aborted right there — meaning the accounts for
    // THAT account got processed, but the connection-status update below
    // (which only runs once, after the whole loop) never ran at all.
    // Confirmed against real data: accounts were correctly archived, but
    // the connection itself silently never got marked removed. Wrapping
    // each account's work means one bad account can never block the
    // connection from actually being marked removed.
    try {
      await supabase
        .from("investment_holdings")
        .update({
          record_status: "archived",
          archive_reason: "snaptrade_connection_removed",
          archived_at: new Date().toISOString(),
          provider_migration_status: "snaptrade_archived_connection_removed",
        })
        .eq("user_id", user.id)
        .eq("investment_account_id", (account as any).id)
        .neq("record_status", "archived");

      await supabase
        .from("investment_accounts")
        .update({
          record_status: "archived",
          archive_reason: "snaptrade_connection_removed",
          archived_at: new Date().toISOString(),
          provider_import_enabled: false,
          provider_migration_status: "snaptrade_archived_connection_removed",
        })
        .eq("user_id", user.id)
        .eq("id", (account as any).id);

      await restoreManualAccountsForSnapTradeAccount(supabase, user.id, (account as any).id);
    } catch (error) {
      providerDeleteNote += ` (Warning: one account did not fully archive: ${error instanceof Error ? error.message : "unknown error"}.)`;
    }
  }

  const connectionUpdate = {
    // BUGFIX (remove-access silently never worked, for anyone, ever):
    // this used to set "removing"/"removed" — neither value is allowed
    // by integration_connections' own check constraint (only
    // planned/sandbox/connected/needs_reauth/disabled are permitted).
    // Every single disconnect attempt was hitting a constraint violation
    // on this exact update, silently discarded because the result was
    // never checked. 'disabled' is the correct existing status for this.
    status: "disabled",
    review_status: "archived",
    notes: providerDeleteNote,
    updated_at: new Date().toISOString(),
  } as Record<string, any>;
  let connectionRequest = supabase
    .from("integration_connections")
    .update(connectionUpdate)
    .eq("user_id", user.id)
    .eq("provider", "SnapTrade");
  if (localConnectionId) connectionRequest = connectionRequest.eq("id", localConnectionId);
  else if (externalConnectionId) connectionRequest = connectionRequest.eq("external_connection_id", externalConnectionId);
  // BUGFIX (remove-access stuck as "connected"): this result was
  // previously completely discarded — `await connectionRequest;` with no
  // error check at all. If this specific update failed for any reason
  // (RLS, a bad id match, anything), there was no way to ever know; the
  // connection would just silently stay "connected" forever, exactly as
  // reported. Now throws so the failure is visible instead of invisible.
  const { error: connectionUpdateError, count: connectionUpdateCount } = await connectionRequest.select("id", { count: "exact" });
  if (connectionUpdateError) {
    throw new Error(`Failed to update the connection's own status: ${connectionUpdateError.message}`);
  }
  if (!connectionUpdateCount) {
    throw new Error("Remove access did not match any connection row — the connection_id/external_connection_id sent from the button may not match what's stored.");
  }

  const { count: activeSnapTradeCount } = await supabase
    .from("investment_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("external_provider", "snaptrade")
    .neq("record_status", "archived");

  if (!activeSnapTradeCount) {
    await supabase
      .from("app_user_profiles")
      .update({ market_data_provider_status: "manual" })
      .eq("user_id", user.id)
      .then(() => null, () => null);
  }

  revalidatePath("/account");
  revalidatePath("/investments");
  revalidatePath("/integrations");
}

function accountNullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function accountNumber(value: FormDataEntryValue | null) {
  const text = String(value || "").replace(/[,£%]/g, "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getAccountHouseholdContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const householdId = await getHouseholdId(supabase, userId);
  return householdId;
}

export async function saveEmploymentJob(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getAccountHouseholdContext(supabase, user.id);
  const file = formData.get("job_document") as File | null;
  const fileName = file && file.size > 0 ? file.name : null;
  const documentStoragePreference = String(formData.get("document_storage_preference") || "digest_only");
  const notes = accountNullableString(formData.get("notes"));
  let extractedSummary = notes;

  if (fileName) {
    const sizeKb = Math.round((file?.size || 0) / 1024);
    extractedSummary = [
      notes,
      `Document received: ${fileName} (${sizeKb}KB). Structured fields above are saved; default mode is digest-only unless original storage was selected.`,
    ].filter(Boolean).join("\n\n");
  }

  const payload = {
    user_id: user.id,
    household_id: householdId,
    person_id: accountNullableString(formData.get("person_id")),
    employer_name: accountNullableString(formData.get("employer_name")),
    role_title: accountNullableString(formData.get("role_title")),
    employment_type: accountNullableString(formData.get("employment_type")) || "employed",
    start_date: accountNullableString(formData.get("start_date")),
    end_date: accountNullableString(formData.get("end_date")),
    annual_leave_days: accountNumber(formData.get("annual_leave_days")),
    carried_over_leave_days: accountNumber(formData.get("carried_over_leave_days")) || 0,
    bank_holidays_included: formData.get("bank_holidays_included") === "on",
    contracted_hours_per_week: accountNumber(formData.get("contracted_hours_per_week")),
    contracted_days_per_week: accountNumber(formData.get("contracted_days_per_week")),
    work_pattern: accountNullableString(formData.get("work_pattern")),
    salary_link_mode: accountNullableString(formData.get("salary_link_mode")) || "separate_income_record",
    document_storage_preference: documentStoragePreference,
    source_document_name: fileName,
    source_document_size_bytes: file?.size || null,
    original_document_retained: documentStoragePreference === "store_original" && Boolean(fileName),
    extracted_summary: extractedSummary,
    notes,
    updated_at: new Date().toISOString(),
  } as Record<string, any>;

  const id = accountNullableString(formData.get("id"));
  const request = id
    ? supabase.from("employment_jobs").update(payload).eq("id", id).eq("user_id", user.id)
    : supabase.from("employment_jobs").insert(payload);
  const { error } = await request;
  if (error) throw new Error(error.message);

  revalidatePath("/account");
  revalidatePath("/lifestyle/family-planning");
}

export async function deleteEmploymentJob(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const { error } = await supabase.from("employment_jobs").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
  revalidatePath("/lifestyle/family-planning");
}

export async function saveHealthAccountSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getOrCreateHouseholdId(supabase, user);
  const { error } = await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    household_id: householdId,
    email: user.email || null,
    health_height_cm: Number(formData.get("health_height_cm") || 0) || null,
    health_weight_kg: Number(formData.get("health_weight_kg") || 0) || null,
    health_sex: String(formData.get("health_sex") || "not_set"),
    health_activity_level: String(formData.get("health_activity_level") || "not_set"),
    health_goal: String(formData.get("health_goal") || "general"),
    health_training_load: String(formData.get("health_training_load") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}

export async function saveWealthAccountSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdId = await getOrCreateHouseholdId(supabase, user);
  const { error } = await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    household_id: householdId,
    email: user.email || null,
    financial_flow_student_loan_enabled: formData.get("financial_flow_student_loan_enabled") === "on",
    wealth_has_mortgage: formData.get("wealth_has_mortgage") === "on",
    wealth_has_pension: formData.get("wealth_has_pension") === "on",
    wealth_has_investments: formData.get("wealth_has_investments") === "on",
    wealth_has_savings: formData.get("wealth_has_savings") === "on",
    wealth_has_credit_cards_or_loans: formData.get("wealth_has_credit_cards_or_loans") === "on",
    wealth_has_childcare_costs: formData.get("wealth_has_childcare_costs") === "on",
    wealth_has_car_finance: formData.get("wealth_has_car_finance") === "on",
    wealth_has_business_income: formData.get("wealth_has_business_income") === "on",
    financial_flow_show_person_names: formData.get("financial_flow_show_person_names") === "on",
    child_profile_avatar_mode: String(formData.get("child_profile_avatar_mode") || "safe_characters"),
    spending_person_display_mode: formData.get("financial_flow_show_person_names") === "on" ? "both" : "image",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  if (householdId) {
    const livingProfileId = String(formData.get("household_living_profile_id") || "").trim();
    const payload = {
      household_id: householdId,
      user_id: user.id,
      property_kind: String(formData.get("home_property_kind") || "house"),
      property_style: String(formData.get("home_property_style") || "unknown"),
      tenure: String(formData.get("home_tenure") || "unknown"),
      bedrooms: Number(formData.get("home_bedrooms") || 0) || null,
      occupants_override: Number(formData.get("home_occupants_override") || 0) || null,
      heating_type: String(formData.get("home_heating_type") || "gas"),
      epc_rating: String(formData.get("home_epc_rating") || "").trim() || null,
      source: "account_wealth",
      confidence_score: 70,
      updated_at: new Date().toISOString(),
    };
    const profileWrite = livingProfileId
      ? await supabase.from("household_living_profiles").update(payload).eq("id", livingProfileId)
      : await supabase.from("household_living_profiles").insert(payload);
    if (profileWrite.error && profileWrite.error.code !== "42P01") throw new Error(profileWrite.error.message);
  }

  revalidatePath("/account");
  revalidatePath("/financial-flow");
  revalidatePath("/spending");
  revalidatePath("/household");
}
