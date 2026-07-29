"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function initialisePlatformHousehold() {
  const { supabase, user } = await requireUser();

  const { data: existingMembership } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (existingMembership?.household_id) {
    revalidatePath("/platform");
    return;
  }

  const { data: household, error: householdError } = await supabase
    .from("app_households")
    .insert({
      owner_user_id: user.id,
      name: "My household",
      timezone: "Europe/London",
      currency: "GBP",
    })
    .select("id")
    .single();

  if (householdError) throw new Error(householdError.message);

  const { error: memberError } = await supabase.from("app_household_members").insert({
    household_id: household.id,
    user_id: user.id,
    role: "owner",
    status: "active",
  });

  if (memberError) throw new Error(memberError.message);

  await supabase.from("app_platform_notes").insert({
    user_id: user.id,
    household_id: household.id,
    note_type: "readiness",
    title: "Default household created",
    body: "The platform tenancy layer is now initialised for this user.",
    status: "done",
  });

  revalidatePath("/platform");
}

export async function requestDataExport(formData: FormData) {
  const { supabase, user } = await requireUser();
  const exportType = String(formData.get("export_type") || "full_json");

  const { data: membership } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const { error } = await supabase.from("app_export_jobs").insert({
    user_id: user.id,
    household_id: membership?.household_id || null,
    export_type: exportType,
    status: "requested",
    notes: "Export requested from Platform page. Worker implementation can be added before production.",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}

export async function addPlatformNote(formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();

  if (!title) throw new Error("Add a title for the platform note.");

  const { data: membership } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const { error } = await supabase.from("app_platform_notes").insert({
    user_id: user.id,
    household_id: membership?.household_id || null,
    note_type: "readiness",
    title,
    body,
    status: "open",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}

export async function markPlatformNoteDone(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");

  const { error } = await supabase
    .from("app_platform_notes")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}
