"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess, createBestAdminClient } from "@/lib/admin/access";
import { describeSupabaseAdminKey } from "@/lib/supabase/admin";
import { writeAdminAuditEvent } from "@/lib/admin/audit";
import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";
import { runSavingsRateWatch, expireStaleSavingsDeals } from "@/lib/wealth/savings-rate-watch";
import { runMortgageRenewalWatch, expireStaleMortgageRateDeals } from "@/lib/wealth/mortgage-renewal-watch";
import { loadWealthWatchSettings } from "@/lib/wealth/watch-settings";
import { fetchSourceText, parseMortgageDealsFromSource, parseSavingsDealsFromSource } from "@/lib/wealth/source-ingestion";

function adminClient() {
  const supabase = createBestAdminClient();
  if (!supabase) {
    const status = describeSupabaseAdminKey();
    throw new Error(`${status.reason} Wealth Watch admin jobs need SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY set server-side as a service_role JWT or Supabase sb_secret_ key.`);
  }
  return supabase;
}

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function numberOrNull(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export async function saveWealthWatchSettings(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const rows = [
    ["savings_minimum_rate_delta", numberOrNull(formData.get("savings_minimum_rate_delta")) ?? 0.1],
    ["savings_max_recommendations_per_account", numberOrNull(formData.get("savings_max_recommendations_per_account")) ?? 5],
    ["savings_stale_days", numberOrNull(formData.get("savings_stale_days")) ?? 14],
    ["mortgage_alert_months", numberOrNull(formData.get("mortgage_alert_months")) ?? 9],
    ["mortgage_source_freshness_days", numberOrNull(formData.get("mortgage_source_freshness_days")) ?? 14],
    ["mortgage_max_recommendations_per_deal", numberOrNull(formData.get("mortgage_max_recommendations_per_deal")) ?? 8],
  ].map(([setting_key, setting_value]) => ({ setting_key, setting_value: String(setting_value), updated_by: access.user.id, updated_at: new Date().toISOString() }));

  const { error } = await supabase.from("wealth_watch_settings").upsert(rows, { onConflict: "setting_key" });
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: "wealth_watch_settings_update", entityKind: "wealth_watch_settings", afterPayload: rows });
  revalidatePath("/admin/wealth-watch");
}

export async function runSavingsWatchNow(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const result = await runSavingsRateWatch(supabase, {
    runKey: `savings-rate-watch:admin:${Date.now()}`,
    runKind: "admin_manual",
    limit: numberOrNull(formData.get("limit")) ?? 500,
    triggeredBy: access.user.email || access.user.id,
    respectTier: true,
  });
  await writeAdminAuditEvent({ actionKey: "wealth_watch_savings_manual_run", entityKind: "savings_rate_watch_runs", afterPayload: result });
  revalidatePath("/admin/wealth-watch");
}

export async function runMortgageWatchNow(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const result = await runMortgageRenewalWatch(supabase, {
    runKey: `mortgage-renewal-watch:admin:${Date.now()}`,
    runKind: "admin_manual",
    limit: numberOrNull(formData.get("limit")) ?? 250,
    triggeredBy: access.user.email || access.user.id,
    respectTier: true,
  });
  await writeAdminAuditEvent({ actionKey: "wealth_watch_mortgage_manual_run", entityKind: "mortgage_renewal_watch_runs", afterPayload: result });
  revalidatePath("/admin/wealth-watch");
}

export async function expireStaleDealsNow(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const settings = await loadWealthWatchSettings(supabase);
  const kind = clean(formData.get("kind")) || "both";
  const savingsDays = numberOrNull(formData.get("savings_days")) ?? settings.savingsStaleDays;
  const mortgageDays = numberOrNull(formData.get("mortgage_days")) ?? settings.mortgageSourceFreshnessDays;
  const result: any = {};
  if (kind === "both" || kind === "savings") result.savings = await expireStaleSavingsDeals(supabase, savingsDays, access.user.email || access.user.id);
  if (kind === "both" || kind === "mortgage") result.mortgages = await expireStaleMortgageRateDeals(supabase, mortgageDays, access.user.email || access.user.id);
  await writeAdminAuditEvent({ actionKey: "wealth_watch_stale_deals_expired", entityKind: "wealth_watch", afterPayload: result, severity: "warning" });
  revalidatePath("/admin/wealth-watch");
}

export async function saveSavingsRateDeal(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const providerName = clean(formData.get("provider_name"));
  const productName = clean(formData.get("product_name"));
  if (!providerName || !productName) throw new Error("Provider and product are required.");
  const id = clean(formData.get("deal_id"));
  const payload = {
    provider_slug: clean(formData.get("provider_slug")) || normaliseProviderSlug(providerName),
    provider_name: providerName,
    product_name: productName,
    account_type: clean(formData.get("account_type")) || "easy_access",
    gross_aer: numberOrNull(formData.get("gross_aer")),
    bonus_rate: numberOrNull(formData.get("bonus_rate")),
    minimum_balance: numberOrNull(formData.get("minimum_balance")),
    maximum_balance: numberOrNull(formData.get("maximum_balance")),
    monthly_max_deposit: numberOrNull(formData.get("monthly_max_deposit")),
    access_type: clean(formData.get("access_type")) || null,
    withdrawal_rules: clean(formData.get("withdrawal_rules")) || null,
    notice_period_days: numberOrNull(formData.get("notice_period_days")),
    term_length_months: numberOrNull(formData.get("term_length_months")),
    rate_type: clean(formData.get("rate_type")) || null,
    requires_existing_customer: bool(formData.get("requires_existing_customer")),
    eligible_provider_slug: clean(formData.get("eligible_provider_slug")) || null,
    eligibility_note: clean(formData.get("eligibility_note")) || null,
    deal_duration_mode: clean(formData.get("deal_duration_mode")) || "ongoing",
    rate_end_date: clean(formData.get("rate_end_date")) || null,
    source_url: clean(formData.get("source_url")) || null,
    source_name: clean(formData.get("source_name")) || "admin",
    detected_by: "admin",
    confidence: numberOrNull(formData.get("confidence")) ?? 80,
    status: clean(formData.get("status")) || "active",
    ai_summary: clean(formData.get("ai_summary")) || null,
    admin_notes: clean(formData.get("admin_notes")) || null,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from("savings_rate_deals").update(payload).eq("id", id)
    : await supabase.from("savings_rate_deals").insert(payload);
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: id ? "savings_rate_deal_update" : "savings_rate_deal_create", entityKind: "savings_rate_deals", entityId: id || productName, afterPayload: payload });
  revalidatePath("/admin/wealth-watch");
}

export async function checkSavingsSource(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const sourceUrl = clean(formData.get("source_url"));
  const providerName = clean(formData.get("provider_name"));
  const productName = clean(formData.get("product_name"));
  if (!sourceUrl || !providerName) throw new Error("Provider and source URL are required.");
  const source = await fetchSourceText(sourceUrl);
  const parsedDeals = parseSavingsDealsFromSource({ providerName, productName, sourceUrl: source.url, text: source.text });
  const inserted: string[] = [];

  for (const parsed of parsedDeals) {
    const payload = {
      provider_slug: parsed.providerSlug,
      provider_name: parsed.providerName,
      product_name: parsed.productName,
      account_type: parsed.accountType,
      gross_aer: parsed.grossAer,
      bonus_rate: parsed.bonusRate ?? null,
      minimum_balance: parsed.minimumBalance ?? null,
      maximum_balance: parsed.maximumBalance ?? null,
      monthly_max_deposit: parsed.monthlyMaxDeposit ?? null,
      access_type: parsed.accessType ?? null,
      withdrawal_rules: parsed.withdrawalRules ?? null,
      notice_period_days: parsed.noticePeriodDays ?? null,
      term_length_months: parsed.termLengthMonths ?? null,
      rate_type: parsed.rateType ?? null,
      source_payload: { parsed, parsedDealCount: parsedDeals.length, sourceContentType: source.contentType },
      requires_existing_customer: parsed.requiresExistingCustomer,
      eligible_provider_slug: parsed.requiresExistingCustomer ? parsed.providerSlug : null,
      eligibility_note: parsed.eligibilityNote,
      source_url: parsed.sourceUrl,
      source_name: new URL(parsed.sourceUrl).hostname,
      detected_by: parsedDeals.length > 1 ? "admin_source_table_check" : "admin_source_check",
      confidence: parsed.confidence,
      status: parsed.confidence >= 55 ? "needs_review" : "draft",
      ai_summary: parsed.summary,
      admin_notes: "Created by admin source check. Confirm rate, eligibility and product details before marking active.",
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("savings_rate_deals").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    if (data?.id) inserted.push(data.id);
  }

  await supabase.from("wealth_watch_source_jobs").insert({ job_kind: "savings_source_check", source_url: source.url, status: "completed", created_by: access.user.id, result_payload: { parsed_deals: parsedDeals, deal_ids: inserted } });
  await writeAdminAuditEvent({ actionKey: "savings_source_check", entityKind: "savings_rate_deals", afterPayload: { parsedDealCount: parsedDeals.length, dealIds: inserted } });
  revalidatePath("/admin/wealth-watch");
  revalidatePath("/admin/savings");
}

export async function saveMortgageRateDeal(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const lenderName = clean(formData.get("lender_name"));
  if (!lenderName) throw new Error("Lender is required.");
  const id = clean(formData.get("deal_id"));
  const payload = {
    lender_slug: clean(formData.get("lender_slug")) || normaliseProviderSlug(lenderName),
    lender_name: lenderName,
    product_name: clean(formData.get("product_name")) || null,
    rate_type: clean(formData.get("rate_type")) || "fixed",
    initial_term_months: numberOrNull(formData.get("initial_term_months")),
    ltv_max: numberOrNull(formData.get("ltv_max")),
    ltv_min: numberOrNull(formData.get("ltv_min")),
    rate_percent: numberOrNull(formData.get("rate_percent")),
    product_fee: numberOrNull(formData.get("product_fee")),
    existing_customer_only: bool(formData.get("existing_customer_only")),
    new_customer_available: !bool(formData.get("existing_customer_only")) || bool(formData.get("new_customer_available")),
    source_url: clean(formData.get("source_url")) || null,
    source_name: clean(formData.get("source_name")) || "admin",
    source_checked_at: new Date().toISOString(),
    confidence: numberOrNull(formData.get("confidence")) ?? 80,
    status: clean(formData.get("status")) || "active",
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from("mortgage_rate_deals").update(payload).eq("id", id)
    : await supabase.from("mortgage_rate_deals").insert(payload);
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: id ? "mortgage_rate_deal_update" : "mortgage_rate_deal_create", entityKind: "mortgage_rate_deals", entityId: id || lenderName, afterPayload: payload });
  revalidatePath("/admin/wealth-watch");
}

export async function checkMortgageSource(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const sourceUrl = clean(formData.get("source_url"));
  const lenderName = clean(formData.get("lender_name"));
  if (!sourceUrl || !lenderName) throw new Error("Lender and source URL are required.");
  const source = await fetchSourceText(sourceUrl);
  const parsed = parseMortgageDealsFromSource({ lenderName, sourceUrl: source.url, text: source.text });
  const inserted: string[] = [];
  for (const deal of parsed) {
    const { data, error } = await supabase.from("mortgage_rate_deals").insert({
      lender_slug: deal.lenderSlug,
      lender_name: deal.lenderName,
      product_name: deal.productName,
      rate_type: deal.rateType,
      initial_term_months: deal.initialTermMonths,
      ltv_max: deal.ltvMax,
      ltv_min: deal.ltvMin,
      rate_percent: deal.ratePercent,
      product_fee: deal.productFee,
      existing_customer_only: deal.existingCustomerOnly,
      new_customer_available: deal.newCustomerAvailable,
      source_url: deal.sourceUrl,
      source_name: new URL(deal.sourceUrl).hostname,
      source_checked_at: new Date().toISOString(),
      confidence: deal.confidence,
      status: deal.confidence >= 55 ? "needs_review" : "draft",
      payload: { summary: deal.summary, created_by: "admin_source_check" },
    }).select("id").single();
    if (error) throw new Error(error.message);
    if (data?.id) inserted.push(data.id);
  }
  await supabase.from("mortgage_lender_sources").upsert({
    lender_slug: normaliseProviderSlug(lenderName),
    lender_name: lenderName,
    source_url: source.url,
    source_kind: "lender_product_page",
    status: "active",
    last_checked_at: new Date().toISOString(),
    check_frequency_hours: 24,
    updated_at: new Date().toISOString(),
  }, { onConflict: "lender_slug,source_url" });
  await supabase.from("wealth_watch_source_jobs").insert({ job_kind: "mortgage_source_check", source_url: source.url, status: "completed", created_by: access.user.id, result_payload: { parsed, inserted } });
  await writeAdminAuditEvent({ actionKey: "mortgage_source_check", entityKind: "mortgage_rate_deals", entityId: inserted.join(","), afterPayload: parsed });
  revalidatePath("/admin/wealth-watch");
}
