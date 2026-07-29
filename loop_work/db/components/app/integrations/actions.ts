"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/security/secrets";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function addIntegrationConnection(formData: FormData) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("integration_connections").insert({
    user_id: user.id,
    provider: String(formData.get("provider") || "Provider"),
    connection_type: String(formData.get("connection_type") || "banking"),
    status: String(formData.get("status") || "planned"),
    category: String(formData.get("category") || String(formData.get("rate_key") || "statutory").split("_")[0]),
    verified_by: "manual",
    review_status: String(formData.get("review_status") || "active"),
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}

export async function saveIntegrationSecret(formData: FormData) {
  const { supabase, user } = await requireUser();

  const provider = String(formData.get("provider") || "openai");
  const keyLabel = String(formData.get("key_label") || "Default key");
  const secretValue = String(formData.get("secret_value") || "").trim();

  if (!secretValue) {
    throw new Error("Paste an API token before saving.");
  }

  const encrypted = encryptSecret(secretValue);

  const { error } = await supabase.from("integration_secrets").insert({
    user_id: user.id,
    provider,
    key_label: keyLabel,
    status: "active",
    ...encrypted,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}

export async function deleteIntegrationSecret(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id"));

  const { error } = await supabase
    .from("integration_secrets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}

export async function deleteIntegrationConnection(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id"));

  const { error } = await supabase
    .from("integration_connections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}

export async function saveStatutoryRateAssumption(formData: FormData) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("statutory_rate_assumptions").insert({
    user_id: user.id,
    rate_key: String(formData.get("rate_key") || "smp_weekly_rate"),
    label: String(formData.get("label") || "Statutory rate"),
    value_numeric: Number(formData.get("value_numeric") || 0),
    value_text: String(formData.get("value_text") || "") || null,
    source_url: String(formData.get("source_url") || "") || null,
    source_name: String(formData.get("source_name") || "") || null,
    effective_from: String(formData.get("effective_from") || "") || null,
    effective_until: String(formData.get("effective_until") || "") || null,
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}

export async function deleteStatutoryRateAssumption(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");

  const { error } = await supabase
    .from("statutory_rate_assumptions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/integrations");
}
