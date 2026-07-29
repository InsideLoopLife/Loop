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

export async function markNotificationRead(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const { error } = await supabase
    .from("app_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function dismissNotification(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const { error } = await supabase
    .from("app_notifications")
    .update({ status: "dismissed", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function createTestNotification() {
  const { supabase, user } = await requireUser();
  const { data: membership } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const { error } = await supabase.from("app_notifications").insert({
    user_id: user.id,
    household_id: membership?.household_id || null,
    notification_type: "test",
    severity: "success",
    title: "Notification hub is working",
    body: "This is where weekly money updates, renewal nudges and health planning reminders will land.",
    cta_label: "Open dashboard",
    cta_href: "/dashboard",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}
