"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, requireAdminAccess } from "@/lib/admin/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashAccessCode, normaliseAccessCode } from "@/lib/access/beta-gate";

function cleanKey(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_\-]+/g, "_").replace(/^_+|_+$/g, "");
}

function cleanUuid(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export async function saveBetaFlag(formData: FormData) {
  await requireAdminAccess();
  const supabase = await createClient();
  const flagKey = cleanKey(formData.get("flag_key"));
  if (!flagKey) throw new Error("Add a beta flag key.");
  const { error } = await supabase.from("app_beta_flags").upsert({
    flag_key: flagKey,
    label: String(formData.get("label") || flagKey).trim(),
    description: String(formData.get("description") || "").trim() || null,
    scope: String(formData.get("scope") || "site"),
    enabled: formData.get("enabled") === "on",
    rollout_percent: Number(formData.get("rollout_percent") || 0),
    requires_admin_approval: formData.get("requires_admin_approval") === "on",
    notes: String(formData.get("notes") || "").trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "flag_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/beta");
  revalidatePath("/admin/tiers");
  revalidatePath("/account/plan");
}

export async function deleteBetaFlag(formData: FormData) {
  await requireAdminAccess();
  const supabase = await createClient();
  const flagKey = cleanKey(formData.get("flag_key"));
  if (!flagKey) return;
  const { error } = await supabase.from("app_beta_flags").delete().eq("flag_key", flagKey);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/beta");
}

export async function createPrivateBetaCode(formData: FormData) {
  await requireAdminAccess();
  const supabase = createBestAdminClient() || createAdminClient();
  const plainCode = normaliseAccessCode(String(formData.get("plain_code") || ""));
  if (plainCode.length < 6) throw new Error("Use an access code of at least 6 characters.");

  const label = String(formData.get("label") || "Private beta invite").trim();
  const notes = String(formData.get("notes") || "").trim();
  const maxUses = Math.max(1, Number(formData.get("max_uses") || 1));
  const expiresAtRaw = String(formData.get("expires_at") || "").trim();
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;
  const codeHash = hashAccessCode(plainCode);

  const { error } = await supabase.from("private_beta_codes").insert({
    label,
    code_hash: codeHash,
    code_hash_prefix: codeHash.slice(0, 12),
    max_uses: maxUses,
    expires_at: expiresAt,
    notes: notes || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/beta");
}

export async function disablePrivateBetaCode(formData: FormData) {
  await requireAdminAccess();
  const supabase = createBestAdminClient() || createAdminClient();
  const id = cleanUuid(formData.get("id"));
  if (!id) return;
  const { error } = await supabase.from("private_beta_codes").update({ disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/beta");
}

export async function enablePrivateBetaCode(formData: FormData) {
  await requireAdminAccess();
  const supabase = createBestAdminClient() || createAdminClient();
  const id = cleanUuid(formData.get("id"));
  if (!id) return;
  const { error } = await supabase.from("private_beta_codes").update({ disabled_at: null, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/beta");
}

export async function deletePrivateBetaCode(formData: FormData) {
  await requireAdminAccess();
  const supabase = createBestAdminClient() || createAdminClient();
  const id = cleanUuid(formData.get("id"));
  if (!id) return;
  const { error } = await supabase.from("private_beta_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/beta");
}
