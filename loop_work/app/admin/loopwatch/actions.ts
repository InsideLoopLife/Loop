"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/lib/admin/access";
import { normaliseProviderSlug } from "@/lib/loopwatch/watch-logic";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function numberValue(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function upsertLoopWatchProviderRule(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await createClient();
  const id = text(formData, "id");
  const providerName = text(formData, "provider_name") || "Provider";
  const providerSlug = normaliseProviderSlug(text(formData, "provider_slug") || providerName) || "provider";

  const payload = {
    provider_slug: providerSlug,
    provider_name: providerName,
    applies_to_item_type: text(formData, "applies_to_item_type") || "mobile_contract",
    rule_label: text(formData, "rule_label") || "Annual provider increase",
    increase_month: numberValue(formData, "increase_month") || 4,
    increase_day: numberValue(formData, "increase_day") || 1,
    increase_amount_monthly: numberValue(formData, "increase_amount_monthly"),
    increase_percent: numberValue(formData, "increase_percent"),
    effective_from: text(formData, "effective_from"),
    effective_to: text(formData, "effective_to"),
    source_url: text(formData, "source_url"),
    source_label: text(formData, "source_label"),
    status: text(formData, "status") || "needs_review",
    confidence: numberValue(formData, "confidence") || 70,
    notes: text(formData, "notes"),
    created_by: access.user.id,
    updated_at: new Date().toISOString(),
  };

  const response = id
    ? await supabase.from("loopwatch_provider_rules").update(payload).eq("id", id)
    : await supabase.from("loopwatch_provider_rules").insert(payload);
  if (response.error) throw new Error(response.error.message);
  revalidatePath("/admin/loopwatch");
}
