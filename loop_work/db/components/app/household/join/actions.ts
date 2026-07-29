"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function selectedCategories(formData: FormData) {
  return formData.getAll("share_categories").map(String).filter(Boolean);
}

export async function acceptHouseholdJoinInvite(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const token = String(formData.get("token") || "").trim();
  if (!token) throw new Error("Missing invite token.");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/household/join?token=${token}`)}`);

  const { data: acceptResult, error: acceptError } = await supabase.rpc("app_accept_household_invite", {
    p_token: token,
    p_invite_id: null,
  });
  if (acceptError) throw new Error(acceptError.message);

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
  redirect("/household");
}
