"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext, applyMutableRecordFilter, householdWriteFields } from "@/lib/auth/household-context";
import { buildLoopWatchEvents, type LoopWatchExtraction } from "@/lib/loopwatch/extract";
import { applyLoopWatchCostToFinancialFlow, runLoopWatchForItem } from "@/lib/loopwatch/watch-logic";
import { generateHolidayPeriodsFromTerms } from "@/lib/family/school-calendar-parser";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function numeric(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

export async function updateLoopWatchItem(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  const update = {
    owner_person_id: text(formData, "owner_person_id"),
    item_type: text(formData, "item_type") || "general_contract",
    provider_name: text(formData, "provider_name"),
    product_name: text(formData, "product_name"),
    start_date: text(formData, "start_date"),
    end_date: text(formData, "end_date"),
    renewal_date: text(formData, "renewal_date"),
    notice_period_days: numeric(formData, "notice_period_days"),
    payment_amount: numeric(formData, "payment_amount"),
    payment_frequency: text(formData, "payment_frequency"),
    annual_cost: numeric(formData, "annual_cost"),
    auto_renews: boolValue(formData, "auto_renews"),
    cover_level: text(formData, "cover_level"),
    excess_total: numeric(formData, "excess_total"),
    mileage_limit: numeric(formData, "mileage_limit"),
    interest_rate_percent: numeric(formData, "interest_rate_percent"),
    apr_percent: numeric(formData, "apr_percent"),
    cancellation_summary: text(formData, "cancellation_summary"),
    increase_summary: text(formData, "increase_summary"),
    summary: text(formData, "summary"),
    linked_planned_item_id: text(formData, "linked_planned_item_id"),
    next_price_check_at: text(formData, "next_price_check_at"),
    price_check_cadence_days: numeric(formData, "price_check_cadence_days"),
    review_state: "user_reviewed",
    routing_status: "reviewing",
    status: "needs_review",
    updated_at: new Date().toISOString(),
  };

  const query = (supabase.from("loopwatch_items").update(update) as any);
  const { error } = await applyMutableRecordFilter(query, id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/loopwatch");
}

export async function confirmLoopWatchItem(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  await updateLoopWatchItem(formData);

  const { data: item, error: readError } = await applyMutableRecordFilter(
    (supabase.from("loopwatch_items").select("*") as any),
    id,
    householdContext,
  ).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!item) return;

  const { error: eventsDeleteError } = await supabase.from("loopwatch_events").delete().eq("loopwatch_item_id", id);
  if (eventsDeleteError) throw new Error(eventsDeleteError.message);

  const extractionForEvents: LoopWatchExtraction = {
    documentType: (item.item_type || "general_contract") as any,
    providerName: item.provider_name || null,
    productName: item.product_name || null,
    referenceHint: item.reference_hint || null,
    startDate: item.start_date || null,
    endDate: item.end_date || null,
    renewalDate: item.renewal_date || null,
    noticePeriodDays: item.notice_period_days || null,
    paymentAmount: item.payment_amount || null,
    paymentFrequency: item.payment_frequency || null,
    annualCost: item.annual_cost || null,
    autoRenews: item.auto_renews,
    coverLevel: item.cover_level || null,
    excessTotal: item.excess_total || null,
    mileageLimit: item.mileage_limit || null,
    interestRatePercent: item.interest_rate_percent || null,
    aprPercent: item.apr_percent || null,
    cancellationSummary: item.cancellation_summary || null,
    increaseSummary: item.increase_summary || null,
    keyTerms: item.terms_json || {},
    riskFlags: Array.isArray(item.risk_flags_json) ? item.risk_flags_json : [],
    confidence: item.confidence_json || {},
    summary: item.summary || "LoopWatch item",
    source: "heuristic",
  };

  const events = buildLoopWatchEvents(id, extractionForEvents, user.id, item.household_id || householdContext.householdId || null);
  if (events.length > 0) await supabase.from("loopwatch_events").insert(events);

  const confirmQuery = (supabase
    .from("loopwatch_items")
    .update({ status: "confirmed", routing_status: "confirmed", review_state: "accepted", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }) as any);
  const { error } = await applyMutableRecordFilter(confirmQuery, id, householdContext);
  if (error) throw new Error(error.message);

  const { data: confirmedItem } = await applyMutableRecordFilter(
    (supabase.from("loopwatch_items").select("*") as any),
    id,
    householdContext,
  ).maybeSingle();
  if (confirmedItem) await runLoopWatchForItem(supabase, confirmedItem as any);

  revalidatePath("/loopwatch");
}

export async function archiveLoopWatchItem(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = text(formData, "id");
  if (!id) return;
  const query = (supabase.from("loopwatch_items").update({ status: "archived", updated_at: new Date().toISOString() }) as any);
  const { error } = await applyMutableRecordFilter(query, id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/loopwatch");
}


export async function runLoopWatchItemAction(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  const { data: item, error } = await applyMutableRecordFilter(
    (supabase.from("loopwatch_items").select("*") as any),
    id,
    householdContext,
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return;

  await runLoopWatchForItem(supabase, item as any);
  revalidatePath("/loopwatch");
  revalidatePath("/financial-flow");
}

export async function applyLoopWatchCostAction(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  const { data: item, error } = await applyMutableRecordFilter(
    (supabase.from("loopwatch_items").select("*") as any),
    id,
    householdContext,
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return;

  await applyLoopWatchCostToFinancialFlow(supabase, item as any, householdContext);
  revalidatePath("/loopwatch");
  revalidatePath("/financial-flow");
  revalidatePath("/dashboard");
}


export async function applyLoopWatchSchoolCalendarAction(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = text(formData, "id");
  if (!id) return;

  const { data: item, error } = await applyMutableRecordFilter(
    (supabase.from("loopwatch_items").select("*") as any),
    id,
    householdContext,
  ).maybeSingle();
  if (error) throw new Error(error.message);
  if (!item) return;

  const suggestions = Array.isArray(item.routing_suggestions_json) ? item.routing_suggestions_json : Array.isArray(item.terms_json?.loopwatch_routing?.suggestions) ? item.terms_json.loopwatch_routing.suggestions : [];
  const suggestion = suggestions.find((row: any) => row?.type === "import_school_calendar");
  const payload = suggestion?.payload || {};
  const childPersonId = item.owner_person_id || item.suggested_owner_person_id || null;
  if (!childPersonId) throw new Error("Choose the child/person before importing school dates.");

  const terms = Array.isArray(payload.terms) ? payload.terms : [];
  const periods = Array.isArray(payload.holiday_periods) && payload.holiday_periods.length ? payload.holiday_periods : generateHolidayPeriodsFromTerms(terms as any);
  const insetDays = Array.isArray(payload.inset_days) ? payload.inset_days : [];
  const bankHolidays = Array.isArray(payload.bank_holidays) ? payload.bank_holidays : [];
  if (!periods.length && !insetDays.length && !bankHolidays.length) {
    throw new Error("LoopWatch did not find importable school dates. Add them manually in Family Planning.");
  }

  const { data: source, error: sourceError } = await supabase
    .from("family_calendar_sources")
    .insert({
      ...householdWriteFields(householdContext, user.id),
      label: String(payload.school_name || item.provider_name || item.product_name || "LoopWatch school calendar"),
      source_type: "loopwatch_metadata",
      school_name: payload.school_name || item.provider_name || null,
      academic_year: payload.academic_year || null,
      notes: [
        "Created from LoopWatch extracted metadata. Source document was not stored.",
        item.summary || null,
        Array.isArray(payload.notes) ? payload.notes.join(" ") : null,
      ].filter(Boolean).join("\n\n"),
      last_checked_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (sourceError) throw new Error(sourceError.message);

  const rows: any[] = [];
  for (const period of periods) {
    if (!period.start_date || !period.end_date) continue;
    rows.push({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childPersonId,
      source_id: source?.id || null,
      period_type: "school_holiday",
      label: period.label || "School holiday",
      start_date: period.start_date,
      end_date: period.end_date,
      requires_cover: true,
      expected_cost: 0,
      notes: "Imported from LoopWatch school calendar metadata.",
    });
  }
  for (const inset of insetDays) {
    if (!inset.date) continue;
    rows.push({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childPersonId,
      source_id: source?.id || null,
      period_type: "inset_day",
      label: inset.label || "Inset day",
      start_date: inset.date,
      end_date: inset.date,
      requires_cover: true,
      expected_cost: 0,
      notes: "Imported from LoopWatch school calendar metadata.",
    });
  }
  for (const holiday of bankHolidays) {
    if (!holiday.date) continue;
    rows.push({
      ...householdWriteFields(householdContext, user.id),
      child_person_id: childPersonId,
      source_id: source?.id || null,
      period_type: "bank_holiday",
      label: holiday.label || "Bank holiday",
      start_date: holiday.date,
      end_date: holiday.date,
      requires_cover: false,
      expected_cost: 0,
      notes: "Imported from LoopWatch school calendar metadata.",
    });
  }

  if (rows.length) {
    const { error: insertError } = await supabase.from("family_calendar_periods").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  await supabase.from("loopwatch_items").update({ routing_status: "applied_family_calendar", updated_at: new Date().toISOString() }).eq("id", id);
  await supabase.from("loopwatch_opportunities").update({ status: "done", updated_at: new Date().toISOString() }).eq("loopwatch_item_id", id).eq("opportunity_type", "import_school_calendar");

  revalidatePath("/loopwatch");
  revalidatePath("/lifestyle/family-planning");
  revalidatePath("/dashboard");
}

export async function dismissLoopWatchOpportunityAction(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = text(formData, "opportunity_id");
  if (!id) return;

  let query = supabase.from("loopwatch_opportunities").update({ status: "dismissed", updated_at: new Date().toISOString() }).eq("id", id);
  if (householdContext.householdId && householdContext.isOwnerOrAdmin) {
    query = query.or(`user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)`);
  } else {
    query = query.eq("user_id", householdContext.userId);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/loopwatch");
}
