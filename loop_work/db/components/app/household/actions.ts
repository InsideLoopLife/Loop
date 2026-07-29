"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";
import { getLatestAssumptionValue, recordAssumptionCheck } from "@/lib/assumptions/server";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields, visibleDataOrFilter } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

async function logPayEventAssumptionChecks(supabase: any, userId: string, formData: FormData, relatedId?: string | null) {
  const payKind = String(formData.get("pay_kind") || "salary");
  const studentLoanPlan = String(formData.get("student_loan_plan") || "none");
  const pensionMethod = String(formData.get("pension_method") || "net_pay");

  if (payKind === "maternity") {
    const savedSmp = await getLatestAssumptionValue(supabase, userId, "smp_weekly_rate");
    const expected = Number(savedSmp?.value_numeric ?? 194.32);
    const entered = parseNumber(formData.get("maternity_smp_weekly_rate")) ?? expected;
    const mismatch = Math.abs(entered - expected) > 0.01;

    await recordAssumptionCheck({
      supabase,
      userId,
      area: "maternity_pay",
      relatedTable: "pay_events",
      relatedId,
      status: mismatch ? "warning" : "ok",
      message: mismatch
        ? `Maternity SMP value ${entered} differs from saved assumption ${expected}. Review before trusting projections.`
        : `Maternity SMP checked against saved assumption ${expected}.`,
      assumptionKeys: ["smp_weekly_rate"],
    });
  }

  if (studentLoanPlan !== "none") {
    const key = studentLoanPlan === "postgraduate" ? "student_loan_postgraduate_threshold" : `student_loan_${studentLoanPlan}_threshold`;
    await recordAssumptionCheck({
      supabase,
      userId,
      area: "student_loan",
      relatedTable: "pay_events",
      relatedId,
      status: "ok",
      message: `Student loan plan ${studentLoanPlan.replaceAll("_", " ")} checked against assumptions page.`,
      assumptionKeys: [key],
    });
  }

  if (pensionMethod === "salary_sacrifice" || pensionMethod === "nhs_pension") {
    await recordAssumptionCheck({
      supabase,
      userId,
      area: "pension_method",
      relatedTable: "pay_events",
      relatedId,
      status: "needs_review",
      message: `${pensionMethod.replaceAll("_", " ")} can change taxable pay, NI and student-loan calculations. Check against payslip/pension rules.`,
      assumptionKeys: ["tax_personal_allowance", "ni_primary_threshold_annual"],
    });
  }
}

export async function addPerson(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const name = String(formData.get("name") || "Person").trim() || "Person";
  const relationship = String(formData.get("relationship") || "other");
  const birthDate = String(formData.get("birth_date") || "") || null;

  if (householdContext.householdId && relationship === "child") {
    const { data: existingChild } = await supabase
      .from("people")
      .select("id")
      .eq("household_id", householdContext.householdId)
      .eq("relationship", "child")
      .ilike("name", name)
      .filter("birth_date", birthDate ? "eq" : "is", birthDate || null)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .limit(1)
      .maybeSingle();

    if (existingChild?.id) {
      revalidatePath("/household");
      revalidatePath(`/household/${existingChild.id}`);
      return;
    }
  }

  const { error } = await supabase.from("people").insert({
    ...householdWriteFields(householdContext, user.id),
    name,
    relationship,
    birth_date: birthDate,
    avatar_url: String(formData.get("avatar_url") || "") || null,
    active_from: String(formData.get("active_from") || "") || new Date().toISOString().slice(0, 10),
    active_until: String(formData.get("active_until") || "") || null,
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function updatePersonProfile(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing person id");

  const { error } = await supabase
    .from("people")
    .update({
      name: String(formData.get("name") || "Person"),
      relationship: String(formData.get("relationship") || "other"),
      birth_date: String(formData.get("birth_date") || "") || null,
      avatar_url: String(formData.get("avatar_url") || "") || null,
      active_from: String(formData.get("active_from") || "") || null,
      active_until: String(formData.get("active_until") || "") || null,
      notes: String(formData.get("notes") || ""),
    })
    .eq("id", id)
    .or(visibleDataOrFilter(householdContext));

  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath(`/household/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/income");
}

export async function addPayEvent(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);

  const { error } = await supabase.from("pay_events").insert({
    ...householdWriteFields(householdContext, user.id),
    person_id: String(formData.get("person_id") || "") || null,
    label: String(formData.get("label") || "Pay change"),
    pay_kind: String(formData.get("pay_kind") || "salary"),
    gross_annual_salary: parseNumber(formData.get("gross_annual_salary")) ?? 0,
    monthly_take_home_override: parseNumber(formData.get("monthly_take_home_override")),
    pension_percent: parseNumber(formData.get("pension_percent")) ?? 0,
    pension_method: String(formData.get("pension_method") || "net_pay"),
    student_loan_plan: String(formData.get("student_loan_plan") || "none"),
    effective_from: String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10),
    effective_until: String(formData.get("effective_until") || "") || null,
    maternity_scheme: String(formData.get("maternity_scheme") || "") || null,
    maternity_leave_start: String(formData.get("maternity_leave_start") || "") || null,
    maternity_leave_end: String(formData.get("maternity_leave_end") || "") || null,
    maternity_pay_mode: String(formData.get("maternity_pay_mode") || "") || null,
    maternity_full_pay_weeks: parseNumber(formData.get("maternity_full_pay_weeks")),
    maternity_half_pay_weeks: parseNumber(formData.get("maternity_half_pay_weeks")),
    maternity_smp_only_weeks: parseNumber(formData.get("maternity_smp_only_weeks")),
    maternity_unpaid_weeks: parseNumber(formData.get("maternity_unpaid_weeks")),
    maternity_smp_weekly_rate: parseNumber(formData.get("maternity_smp_weekly_rate")),
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  await logPayEventAssumptionChecks(supabase, user.id, formData, null);
  const personId = String(formData.get("person_id") || "");
  revalidatePath("/household");
  if (personId) revalidatePath(`/household/${personId}`);
  revalidatePath("/dashboard");
  revalidatePath("/affordability");
}


export async function updatePayEvent(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing pay event id");

  const personId = String(formData.get("person_id") || "") || null;

  const { error } = await supabase
    .from("pay_events")
    .update({
      person_id: personId,
      label: String(formData.get("label") || "Pay change"),
      pay_kind: String(formData.get("pay_kind") || "salary"),
      gross_annual_salary: parseNumber(formData.get("gross_annual_salary")) ?? 0,
      monthly_take_home_override: parseNumber(formData.get("monthly_take_home_override")),
      pension_percent: parseNumber(formData.get("pension_percent")) ?? 0,
      pension_method: String(formData.get("pension_method") || "net_pay"),
      student_loan_plan: String(formData.get("student_loan_plan") || "none"),
      effective_from: String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10),
      effective_until: String(formData.get("effective_until") || "") || null,
      maternity_scheme: String(formData.get("maternity_scheme") || "") || null,
      maternity_leave_start: String(formData.get("maternity_leave_start") || "") || null,
      maternity_leave_end: String(formData.get("maternity_leave_end") || "") || null,
      maternity_pay_mode: String(formData.get("maternity_pay_mode") || "") || null,
      maternity_full_pay_weeks: parseNumber(formData.get("maternity_full_pay_weeks")),
      maternity_half_pay_weeks: parseNumber(formData.get("maternity_half_pay_weeks")),
      maternity_smp_only_weeks: parseNumber(formData.get("maternity_smp_only_weeks")),
      maternity_unpaid_weeks: parseNumber(formData.get("maternity_unpaid_weeks")),
      maternity_smp_weekly_rate: parseNumber(formData.get("maternity_smp_weekly_rate")),
      notes: String(formData.get("notes") || ""),
    })
    .eq("id", id)
    .or(visibleDataOrFilter(householdContext));

  if (error) throw new Error(error.message);
  await logPayEventAssumptionChecks(supabase, user.id, formData, id);
  revalidatePath("/household");
  if (personId) revalidatePath(`/household/${personId}`);
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

function buildChildCostPayload(userId: string, formData: FormData, householdContext?: Awaited<ReturnType<typeof getActiveHouseholdContext>>) {
  const costKind = String(formData.get("cost_kind") || "fixed") as "fixed" | "nursery" | "activity";
  const billingMonth = String(formData.get("billing_month") || new Date().toISOString().slice(0, 7)).slice(0, 7);

  const nurseryInput = {
    billingMonth,
    dailyRate: parseNumber(formData.get("daily_rate")) ?? 0,
    extraDailyCost: parseNumber(formData.get("extra_daily_cost")) ?? 0,
    fundedHoursPerWeek: parseNumber(formData.get("funded_hours_per_week")) ?? 0,
    fundingMode: String(formData.get("funding_mode") || "none") as FundingMode,
    hourlyFundingCredit: parseNumber(formData.get("hourly_funding_credit")) ?? 0,
    termWeeksPerYear: parseNumber(formData.get("term_weeks_per_year")) ?? 38,
    billingSchedule: String(formData.get("billing_schedule") || "all_year") as BillingSchedule,
    bankHolidaysAreFree: String(formData.get("bank_holidays_are_free") || "false") === "true",
    taxFreeChildcareEnabled: String(formData.get("tax_free_childcare_enabled") || "false") === "true",
    taxFreeChildcareCapPerQuarter: parseNumber(formData.get("tax_free_childcare_cap_per_quarter")) ?? 500,
    partDayMultiplier: parseNumber(formData.get("part_day_multiplier")) ?? 0.5,
    fullDayHours: parseNumber(formData.get("full_day_hours")) ?? 10,
    partDayHours: parseNumber(formData.get("part_day_hours")) ?? 5,
    mondaySession: String(formData.get("monday_session") || "off") as DaySession,
    tuesdaySession: String(formData.get("tuesday_session") || "off") as DaySession,
    wednesdaySession: String(formData.get("wednesday_session") || "off") as DaySession,
    thursdaySession: String(formData.get("thursday_session") || "off") as DaySession,
    fridaySession: String(formData.get("friday_session") || "off") as DaySession,
    mondayHours: parseNumber(formData.get("monday_hours")) ?? 0,
    tuesdayHours: parseNumber(formData.get("tuesday_hours")) ?? 0,
    wednesdayHours: parseNumber(formData.get("wednesday_hours")) ?? 0,
    thursdayHours: parseNumber(formData.get("thursday_hours")) ?? 0,
    fridayHours: parseNumber(formData.get("friday_hours")) ?? 0,
  };

  const activityInput = {
    billingMonth,
    weeklyCost: parseNumber(formData.get("activity_weekly_cost")) ?? 0,
    activityWeekday: parseNumber(formData.get("activity_weekday")) ?? 6,
    activityBillingMode: String(formData.get("activity_billing_mode") || "calendar") as ActivityBillingMode,
    activityTermWeeksPerYear: parseNumber(formData.get("activity_term_weeks_per_year")) ?? 38,
    bankHolidaysAreFree: nurseryInput.bankHolidaysAreFree,
  };

  const nurseryEstimate = calculateNurseryMonthlyCost(nurseryInput);
  const activityEstimate = calculateActivityMonthlyCost(activityInput);
  const monthlyCost = costKind === "nursery"
    ? nurseryEstimate.estimatedMonthlyCost
    : costKind === "activity"
      ? activityEstimate.estimatedMonthlyCost
      : parseNumber(formData.get("monthly_cost")) ?? 0;

  return {
    ...(householdContext ? householdWriteFields(householdContext, userId) : { user_id: userId }),
    child_id: String(formData.get("child_id") || "") || null,
    label: String(formData.get("label") || "Child cost"),
    cost_kind: costKind,
    monthly_cost: monthlyCost,
    billing_month: `${billingMonth}-01`,
    daily_rate: nurseryInput.dailyRate,
    extra_daily_cost: nurseryInput.extraDailyCost,
    funded_hours_per_week: nurseryInput.fundedHoursPerWeek,
    funding_mode: nurseryInput.fundingMode,
    hourly_funding_credit: nurseryInput.hourlyFundingCredit,
    term_weeks_per_year: nurseryInput.termWeeksPerYear,
    billing_schedule: nurseryInput.billingSchedule,
    bank_holidays_are_free: nurseryInput.bankHolidaysAreFree,
    tax_free_childcare_enabled: nurseryInput.taxFreeChildcareEnabled,
    tax_free_childcare_cap_per_quarter: nurseryInput.taxFreeChildcareCapPerQuarter,
    part_day_multiplier: nurseryInput.partDayMultiplier,
    full_day_hours: nurseryInput.fullDayHours,
    part_day_hours: nurseryInput.partDayHours,
    monday_session: nurseryInput.mondaySession,
    tuesday_session: nurseryInput.tuesdaySession,
    wednesday_session: nurseryInput.wednesdaySession,
    thursday_session: nurseryInput.thursdaySession,
    friday_session: nurseryInput.fridaySession,
    monday_hours: nurseryInput.mondayHours,
    tuesday_hours: nurseryInput.tuesdayHours,
    wednesday_hours: nurseryInput.wednesdayHours,
    thursday_hours: nurseryInput.thursdayHours,
    friday_hours: nurseryInput.fridayHours,
    activity_weekly_cost: activityInput.weeklyCost,
    activity_weekday: activityInput.activityWeekday,
    activity_billing_mode: activityInput.activityBillingMode,
    activity_term_weeks_per_year: activityInput.activityTermWeeksPerYear,
    starts_on: String(formData.get("starts_on") || "") || new Date().toISOString().slice(0, 10),
    ends_on: String(formData.get("ends_on") || "") || null,
    notes: String(formData.get("notes") || ""),
  };
}

function revalidateChildCostPaths(childId: string) {
  revalidatePath("/household");
  if (childId) revalidatePath(`/household/${childId}`);
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function addChildCost(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const payload = buildChildCostPayload(user.id, formData, householdContext);
  const { error } = await supabase.from("child_costs").insert(payload);
  if (error) throw new Error(error.message);
  revalidateChildCostPaths(String(formData.get("child_id") || ""));
}

export async function updateChildCost(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing child cost id");

  const payload = buildChildCostPayload(user.id, formData, householdContext);
  const { error } = await supabase
    .from("child_costs")
    .update(payload)
    .eq("id", id)
    .or(visibleDataOrFilter(householdContext));

  if (error) throw new Error(error.message);
  revalidateChildCostPaths(String(formData.get("child_id") || ""));
}


export async function deletePerson(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("people").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
}

export async function deletePayEvent(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("pay_events").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}

export async function deleteChildCost(formData: FormData) {
  const { supabase, user } = await requireUser();
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("child_costs").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/household");
  revalidatePath("/dashboard");
  revalidatePath("/spending");
  revalidatePath("/affordability");
}
