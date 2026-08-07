"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess, createBestAdminClient } from "@/lib/admin/access";
import { describeSupabaseAdminKey } from "@/lib/supabase/admin";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { writeAdminAuditEvent } from "@/lib/admin/audit";
import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";
import { refreshMortgageCatalogueFromSources } from "@/lib/wealth/mortgage-catalogue";
import { runMortgageRenewalWatch } from "@/lib/wealth/mortgage-renewal-watch";
import { loadWealthWatchSettings } from "@/lib/wealth/watch-settings";

function adminClient() {
  const supabase = createBestAdminClient();
  if (!supabase) {
    const status = describeSupabaseAdminKey();
    throw new Error(`${status.reason} House admin jobs need SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY set server-side as a service_role JWT or Supabase sb_secret_ key.`);
  }
  return supabase;
}

// mortgage_lender_sources and mortgage_rate_deals now live in the
// separate rates-catalogue Supabase project. mortgage_rate_deal_flags
// and app_notifications remain genuine main-app data.
function ratesClient() {
  return createWorkerDatabaseClient("rates");
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

export async function saveMortgageCatalogueSource(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = ratesClient();
  const lenderName = clean(formData.get("lender_name"));
  const sourceUrl = clean(formData.get("source_url"));
  if (!lenderName || !sourceUrl) throw new Error("Lender and source URL are required.");
  const safeUrl = new URL(sourceUrl);
  if (!["https:", "http:"].includes(safeUrl.protocol)) throw new Error("Only http/https source URLs are allowed.");
  const payload = {
    lender_slug: clean(formData.get("lender_slug")) || normaliseProviderSlug(lenderName),
    lender_name: lenderName,
    source_url: safeUrl.toString(),
    source_kind: clean(formData.get("source_kind")) || "lender_product_page",
    status: clean(formData.get("status")) || "active",
    check_frequency_hours: numberOrNull(formData.get("check_frequency_hours")) ?? 24,
    notes: clean(formData.get("notes")) || "Added from Admin > House mortgage catalogue.",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("mortgage_lender_sources").upsert(payload, { onConflict: "lender_slug,source_url" });
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: "house_mortgage_source_saved", entityKind: "mortgage_lender_sources", entityId: payload.source_url, afterPayload: payload });
  revalidatePath("/admin/houses");
}

export async function runMortgageCatalogueRefreshNow(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const settings = await loadWealthWatchSettings(supabase).catch(() => null);
  const result = await refreshMortgageCatalogueFromSources(ratesClient(), {
    runKey: `mortgage-catalogue:admin:${Date.now()}`,
    limit: numberOrNull(formData.get("limit")) ?? Number((settings as any)?.mortgageCatalogueRefreshLimit || 12),
    sourceId: clean(formData.get("source_id")) || null,
    triggeredBy: access.user.email || access.user.id,
    publishConfidenceThreshold: numberOrNull(formData.get("publish_confidence")) ?? Number((settings as any)?.mortgageCatalogueAutoPublishConfidence || 95),
  });
  await writeAdminAuditEvent({ actionKey: "house_mortgage_catalogue_refresh", entityKind: "mortgage_rate_deals", afterPayload: result });
  revalidatePath("/admin/houses");
  revalidatePath("/admin/wealth-watch");
}

export async function runHouseMortgageWatchNow(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const result = await runMortgageRenewalWatch(supabase, ratesClient(), {
    runKey: `mortgage-renewal-watch:house-admin:${Date.now()}`,
    runKind: "house_admin_manual",
    limit: numberOrNull(formData.get("limit")) ?? 250,
    triggeredBy: access.user.email || access.user.id,
    respectTier: true,
  });
  await writeAdminAuditEvent({ actionKey: "house_mortgage_watch_manual_run", entityKind: "mortgage_renewal_watch_runs", afterPayload: result });
  revalidatePath("/admin/houses");
}

export async function updateMortgageCatalogueDealStatus(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = ratesClient();
  const id = clean(formData.get("deal_id"));
  const status = clean(formData.get("status"));
  if (!id || !status) throw new Error("Deal and status are required.");
  const allowed = new Set(["active", "needs_review", "broken", "expired", "draft"]);
  if (!allowed.has(status)) throw new Error("Invalid mortgage catalogue status.");
  const payload: Record<string, any> = {
    status,
    catalogue_status: status === "expired" ? "removed" : status,
    last_admin_checked_at: new Date().toISOString(),
    last_verified_by: access.user.id,
    updated_at: new Date().toISOString(),
  };
  if (status === "active") payload.admin_review_reason = null;
  if (status === "broken") payload.last_broken_report_at = new Date().toISOString();
  const { error } = await supabase.from("mortgage_rate_deals").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: "house_mortgage_catalogue_status_update", entityKind: "mortgage_rate_deals", entityId: id, afterPayload: payload });
  revalidatePath("/admin/houses");
  revalidatePath("/mortgage");
}

export async function markMortgageDealFixedAndNotify(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const rates = ratesClient();
  const id = clean(formData.get("deal_id"));
  if (!id) throw new Error("Deal id is required.");
  const now = new Date().toISOString();

  const { data: deal, error: dealError } = await rates
    .from("mortgage_rate_deals")
    .select("id,lender_name,product_name,source_url,direct_apply_url")
    .eq("id", id)
    .maybeSingle();
  if (dealError) throw new Error(dealError.message);

  const { data: flags, error: flagsError } = await supabase
    .from("mortgage_rate_deal_flags")
    .select("id,user_id")
    .eq("mortgage_rate_deal_id", id)
    .in("status", ["open", "checking"]);
  if (flagsError) throw new Error(flagsError.message);

  const userIds = Array.from(new Set((flags || []).map((flag: any) => flag.user_id).filter(Boolean)));
  if (userIds.length) {
    await supabase.from("app_notifications").insert(userIds.map((userId) => ({
      user_id: userId,
      notification_type: "mortgage_deal_fixed",
      category: "wealth",
      channel: "in_app",
      action_status: "completed",
      severity: "info",
      status: "unread",
      title: "Mortgage deal link checked",
      body: `${deal?.lender_name || "A mortgage lender"}${deal?.product_name ? ` · ${deal.product_name}` : ""} has been checked and updated after your report.`,
      cta_label: "Open mortgage deals",
      cta_href: "/mortgage?tab=mortgage_deals",
      data: { mortgage_rate_deal_id: id, fixed_by: access.user.id },
    })));
  }

  await supabase.from("mortgage_rate_deal_flags").update({ status: "resolved", resolved_at: now, resolved_by: access.user.id, fixed_notified_at: now, updated_at: now }).eq("mortgage_rate_deal_id", id).in("status", ["open", "checking"]);
  const { error } = await rates.from("mortgage_rate_deals").update({ status: "active", catalogue_status: "active", fixed_at: now, fixed_by: access.user.id, fixed_notification_sent_at: userIds.length ? now : null, broken_report_count: 0, last_admin_checked_at: now, updated_at: now }).eq("id", id);
  if (error) throw new Error(error.message);

  await writeAdminAuditEvent({ actionKey: "house_mortgage_deal_fixed_notify", entityKind: "mortgage_rate_deals", entityId: id, afterPayload: { notified_users: userIds.length } });
  revalidatePath("/admin/houses");
  revalidatePath("/notifications");
}

export async function saveMortgageCatalogueDeal(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = ratesClient();
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
    direct_apply_url: clean(formData.get("direct_apply_url")) || null,
    source_url: clean(formData.get("source_url")) || null,
    existing_customer_only: bool(formData.get("existing_customer_only")),
    new_customer_available: !bool(formData.get("existing_customer_only")),
    confidence: numberOrNull(formData.get("confidence")) ?? 90,
    status: clean(formData.get("status")) || "active",
    catalogue_status: clean(formData.get("status")) || "active",
    ingestion_method: id ? "admin_update" : "admin_manual",
    last_verified_by: access.user.id,
    last_admin_checked_at: new Date().toISOString(),
    source_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = id
    ? await supabase.from("mortgage_rate_deals").update(payload).eq("id", id)
    : await supabase.from("mortgage_rate_deals").insert(payload);
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: id ? "house_mortgage_catalogue_deal_update" : "house_mortgage_catalogue_deal_create", entityKind: "mortgage_rate_deals", entityId: id || lenderName, afterPayload: payload });
  revalidatePath("/admin/houses");
}
