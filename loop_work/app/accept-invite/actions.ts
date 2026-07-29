"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function claimPersonInvite(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const inviteId = String(formData.get("invite_id") || "").trim();
  if (!token && !inviteId) throw new Error("Missing invite token.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const next = inviteId ? `/accept-invite?invite=${encodeURIComponent(inviteId)}` : `/accept-invite?token=${encodeURIComponent(token)}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const { data, error } = await supabase.rpc("app_accept_person_invite", {
    p_token: token || null,
    p_invite_id: inviteId || null,
  });

  if (error) {
    throw new Error(`${error.message}. Run db/v27_51_household_digest_safe_rebuild.sql in Supabase, then retry the invite link.`);
  }

  const result = (data || {}) as { person_id?: string; household_id?: string };
  revalidatePath("/household");
  revalidatePath("/account");
  if (result.person_id) revalidatePath(`/household/${result.person_id}`);
  redirect(result.person_id ? `/household/${result.person_id}?claimed=1` : "/household?claimed=1");
}
