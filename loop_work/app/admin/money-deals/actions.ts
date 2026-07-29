"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { poundsToPence } from "@/lib/money/dealMath";
import { writeAdminAuditEvent } from "@/lib/admin/audit";

function bool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export async function saveSavingsDeal(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const id = String(formData.get("deal_id") || "");
  const payload = {
    provider_name: String(formData.get("provider_name") || ""),
    product_name: String(formData.get("product_name") || ""),
    product_type: String(formData.get("product_type") || "regular_saver"),
    rate_aer: Number(formData.get("rate_aer") || 0),
    gross_rate: Number(formData.get("gross_rate") || formData.get("rate_aer") || 0),
    rate_type: String(formData.get("rate_type") || "variable"),
    min_monthly_pence: formData.get("min_monthly") ? poundsToPence(String(formData.get("min_monthly"))) : null,
    max_monthly_pence: formData.get("max_monthly") ? poundsToPence(String(formData.get("max_monthly"))) : null,
    max_balance_pence: formData.get("max_balance") ? poundsToPence(String(formData.get("max_balance"))) : null,
    term_months: formData.get("term_months") ? Number(formData.get("term_months")) : null,
    access_type: String(formData.get("access_type") || "restricted"),
    fscs_covered: bool(formData.get("fscs_covered")),
    requires_current_account: bool(formData.get("requires_current_account")),
    requires_switch: bool(formData.get("requires_switch")),
    requires_direct_debits: bool(formData.get("requires_direct_debits")),
    requires_min_monthly_pay_in: bool(formData.get("requires_min_monthly_pay_in")),
    min_monthly_pay_in_pence: formData.get("min_monthly_pay_in") ? poundsToPence(String(formData.get("min_monthly_pay_in"))) : null,
    new_customers_only: bool(formData.get("new_customers_only")),
    eligibility_notes: String(formData.get("eligibility_notes") || ""),
    opening_url: String(formData.get("opening_url") || "") || null,
    source_url: String(formData.get("source_url") || "") || null,
    source_provider: String(formData.get("source_provider") || "manual"),
    source_confidence: Number(formData.get("source_confidence") || 60),
    rate_last_checked_at: new Date().toISOString(),
    status: String(formData.get("status") || "active"),
    created_by: userData.user?.id || null,
  };

  if (!payload.provider_name || !payload.product_name) {
    throw new Error("Provider and product name are required.");
  }

  if (id) {
    const { error } = await supabase.from("loop_money_savings_deals").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("loop_money_savings_deals").insert(payload);
    if (error) throw new Error(error.message);
  }

  await writeAdminAuditEvent({
    actionKey: id ? "money_deal_update" : "money_deal_create",
    entityKind: "loop_money_savings_deals",
    entityId: id || payload.product_name,
    afterPayload: payload,
    severity: "info",
  });

  revalidatePath("/admin/money-deals");
}

export async function queueDealRefresh(formData: FormData) {
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id") || "");
  const sourceUrl = String(formData.get("source_url") || "");

  if (!dealId || !sourceUrl) throw new Error("Missing deal/source URL.");

  const { error } = await supabase.from("loop_money_deal_refresh_jobs").insert({
    deal_id: dealId,
    source_url: sourceUrl,
    status: "queued",
  });

  if (error) throw new Error(error.message);

  await writeAdminAuditEvent({
    actionKey: "money_deal_refresh_queued",
    entityKind: "loop_money_savings_deals",
    entityId: dealId,
    afterPayload: { source_url: sourceUrl },
  });

  revalidatePath("/admin/money-deals");
}
