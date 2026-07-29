"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function completeOnboarding() {
  const { supabase, user } = await requireUser();
  await supabase.from("app_user_profiles").upsert({ user_id: user.id, onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/onboarding");
  redirect("/dashboard");
}

export async function skipOnboarding() {
  const { supabase, user } = await requireUser();
  await supabase.from("app_user_profiles").upsert({ user_id: user.id, onboarding_skipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/onboarding");
  redirect("/dashboard");
}
