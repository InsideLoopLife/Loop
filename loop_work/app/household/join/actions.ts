"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";


async function alreadyActiveMember(userId: string, inviteId: string, token: string) {
  if (!hasSupabaseAdminKey()) return false;
  const admin = createAdminClient();
  const inviteQuery = admin
    .from("household_join_invites")
    .select("id, household_id, short_code, token_hash")
    .limit(1);
  const { data: invite } = inviteId
    ? await inviteQuery.eq("id", inviteId).maybeSingle()
    : await inviteQuery.or(`short_code.eq.${token},token_hash.eq.${crypto.createHash("sha256").update(token).digest("hex")}`).maybeSingle();
  if (!invite?.household_id) return false;
  const { data: membership } = await admin
    .from("app_household_members")
    .select("id")
    .eq("user_id", userId)
    .eq("household_id", invite.household_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership?.id) return false;

  await admin
    .from("app_notifications")
    .update({ status: "dismissed", action_status: "not_applicable", read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("household_id", invite.household_id)
    .eq("notification_type", "household_invite")
    .neq("status", "dismissed");

  return true;
}

function selectedCategories(formData: FormData) {
  return formData.getAll("share_categories").map(String).filter(Boolean);
}

export async function acceptHouseholdJoinInvite(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = String(formData.get("token") || "").trim();
  const inviteId = String(formData.get("invite_id") || "").trim();
  const nextPath = inviteId ? `/household/join?invite=${encodeURIComponent(inviteId)}` : `/household/join?token=${encodeURIComponent(token)}`;

  if (!token && !inviteId) throw new Error("Missing invite token.");
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  if (await alreadyActiveMember(user.id, inviteId, token)) {
    revalidatePath("/account");
    revalidatePath("/household");
    revalidatePath("/notifications");
    redirect("/household?already-member=1");
  }

  const { data: acceptResult, error: acceptError } = await supabase.rpc("app_accept_household_invite", {
    p_token: token || null,
    p_invite_id: inviteId || null,
  });
  if (acceptError) throw new Error(`${acceptError.message}. Run db/v28_26_household_scope_repair.sql in Supabase, then retry the invite link.`);

  const householdId = typeof acceptResult === "string" ? acceptResult : acceptResult?.household_id;
  if (!householdId) throw new Error("Household invite accepted but no household was returned.");

  const shareMode = String(formData.get("share_mode") || "none");
  const fromDate = String(formData.get("from_date") || "").trim() || null;
  const categories = selectedCategories(formData);

  if (shareMode !== "none" && categories.length > 0) {
    const { error: shareError } = await supabase.rpc("app_share_my_history_with_household", {
      p_household_id: householdId,
      p_share_mode: shareMode,
      p_from_date: fromDate,
      p_categories: categories,
    });
    if (shareError) throw new Error(shareError.message);
  }

  revalidatePath("/account");
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/income");
  revalidatePath("/spending");
  revalidatePath("/accounts");
  revalidatePath("/net-worth");
  revalidatePath("/financial-flow");
  revalidatePath("/notifications");
  redirect("/household?joined=1");
}
