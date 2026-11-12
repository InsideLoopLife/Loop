"use server";
import { runFriendly } from "@/lib/actions/friendly";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { maternityExtrasFormPatch } from "@/lib/calculations/maternity";
import { ActiveHouseholdContext, applyMutableRecordFilter, changeRecord, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

async function requireIncomeUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

async function resolveIncomePersonId(supabase: any, userId: string, householdContext: ActiveHouseholdContext, rawPersonId: FormDataEntryValue | null) {
  const requested = String(rawPersonId || "").trim();
  if (requested) return requested;

  let query = supabase
    .from("people")
    .select("id, relationship, linked_user_id, user_id, created_at")
    .in("relationship", ["self", "partner", "other"])
    .is("active_until", null)
    .limit(20);

  if (householdContext.householdId) {
    query = query.eq("household_id", householdContext.householdId);
  } else {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const people = (data || []) as Array<{ id: string; relationship?: string | null; linked_user_id?: string | null; user_id?: string | null; created_at?: string | null }>;
  const ownPerson = people.find((person) => person.linked_user_id === userId || person.user_id === userId || person.relationship === "self");
  const fallback = ownPerson || people[0];
  if (!fallback?.id) throw new Error("Choose a person for this income record. Income cannot be left as household/unassigned.");
  return fallback.id;
}

function payEventPayload(formData: FormData, personId: string) {
  return {
    person_id: personId,
    label: String(formData.get("label") || "Salary"),
    pay_kind: String(formData.get("pay_kind") || "salary"),
    gross_annual_salary: parseNumber(formData.get("gross_annual_salary")) ?? 0,
    monthly_take_home_override: parseNumber(formData.get("monthly_take_home_override")),
    pension_percent: parseNumber(formData.get("pension_percent")) ?? 0,
    pension_method: String(formData.get("pension_method") || "net_pay"),
    employer_pension_percent: parseNumber(formData.get("employer_pension_percent")) ?? 0,
    employer_pension_monthly_amount: parseNumber(formData.get("employer_pension_monthly_amount")),
    employer_ni_topup_enabled: String(formData.get("employer_ni_topup_enabled") || "") === "true",
    employer_ni_rate_percent: parseNumber(formData.get("employer_ni_rate_percent")) ?? 15,
    employer_ni_topup_share_percent: parseNumber(formData.get("employer_ni_topup_share_percent")) ?? 100,
    student_loan_plan: String(formData.get("student_loan_plan") || "none"),
    tax_region: String(formData.get("tax_region") || "") === "scotland" ? "scotland" : "rUK",
    effective_from: String(formData.get("effective_from") || "") || new Date().toISOString().slice(0, 10),
    effective_until: String(formData.get("effective_until") || "") || null,
    pay_timing: String(formData.get("pay_timing") || "last_workday"),
    pay_day_of_month: parseNumber(formData.get("pay_day_of_month")) ?? 28,
    pay_adjustment: String(formData.get("pay_adjustment") || "previous_workday"),
    maternity_scheme: String(formData.get("maternity_scheme") || "") || null,
    maternity_leave_start: String(formData.get("maternity_leave_start") || "") || null,
    maternity_leave_end: String(formData.get("maternity_leave_end") || "") || null,
    maternity_pay_mode: String(formData.get("maternity_pay_mode") || "") || null,
    maternity_full_pay_weeks: parseNumber(formData.get("maternity_full_pay_weeks")),
    maternity_half_pay_weeks: parseNumber(formData.get("maternity_half_pay_weeks")),
    maternity_smp_only_weeks: parseNumber(formData.get("maternity_smp_only_weeks")),
    maternity_unpaid_weeks: parseNumber(formData.get("maternity_unpaid_weeks")),
    maternity_smp_weekly_rate: parseNumber(formData.get("maternity_smp_weekly_rate")),
    ...maternityExtrasFormPatch(formData),
    notes: String(formData.get("notes") || ""),
  };
}

function revalidateIncomeSurfaces(personId?: string | null) {
  revalidatePath("/income");
  revalidatePath("/spending");
  revalidatePath("/dashboard");
  revalidatePath("/affordability");
  if (personId) revalidatePath(`/household/${personId}`);
}

async function addIncomeEntry__save(formData: FormData) {
  const { supabase, user, householdContext } = await requireIncomeUser();
  const personId = await resolveIncomePersonId(supabase, user.id, householdContext, formData.get("person_id"));

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    label: String(formData.get("label") || "Income"),
    gross_amount: parseNumber(formData.get("gross_amount")) ?? 0,
    net_amount: parseNumber(formData.get("net_amount")),
    frequency: String(formData.get("frequency") || "monthly"),
    entry_date: String(formData.get("entry_date") || new Date().toISOString().slice(0, 10)),
  };

  const { error } = await supabase.from("income_entries").insert(payload);
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces(personId);
}

async function updateIncomeEntry__save(formData: FormData) {
  const { supabase, user, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing income id");
  const personId = await resolveIncomePersonId(supabase, user.id, householdContext, formData.get("person_id"));

  const { error } = await changeRecord(
    supabase.from("income_entries").update({
      person_id: personId,
      label: String(formData.get("label") || "Income"),
      gross_amount: parseNumber(formData.get("gross_amount")) ?? 0,
      net_amount: parseNumber(formData.get("net_amount")),
      frequency: String(formData.get("frequency") || "monthly"),
      entry_date: String(formData.get("entry_date") || new Date().toISOString().slice(0, 10)),
    }),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces(personId);
}

async function deleteIncomeEntry__save(formData: FormData) {
  const { supabase, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id"));
  const { error } = await changeRecord(
    supabase.from("income_entries").delete(),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces();
}

async function addRecurringPayEvent__save(formData: FormData) {
  const { supabase, user, householdContext } = await requireIncomeUser();
  const personId = await resolveIncomePersonId(supabase, user.id, householdContext, formData.get("person_id"));
  const payload = {
    ...householdWriteFields(householdContext, user.id),
    ...payEventPayload(formData, personId),
  };

  const { error } = await supabase.from("pay_events").insert(payload as any);
  if (error) throw new Error(error.message);

  // "This replaces their current pay": end the previous open salary the day
  // before the new one starts, so history reads cleanly (old job → new job).
  if (String(formData.get("replace_previous") || "") === "yes" && payload.pay_kind === "salary") {
    const start = new Date(`${payload.effective_from}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 1);
    const dayBefore = start.toISOString().slice(0, 10);
    await supabase
      .from("pay_events")
      .update({ effective_until: dayBefore })
      .eq("person_id", personId)
      .eq("pay_kind", "salary")
      .lt("effective_from", payload.effective_from)
      .or(`effective_until.is.null,effective_until.gte.${payload.effective_from}`);
  }
  revalidateIncomeSurfaces(personId);
}

async function updateRecurringPayEvent__save(formData: FormData) {
  const { supabase, user, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing pay event id");
  const personId = await resolveIncomePersonId(supabase, user.id, householdContext, formData.get("person_id"));

  const { error } = await changeRecord(
    supabase.from("pay_events").update(payEventPayload(formData, personId) as any),
    id,
    householdContext,
  );
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces(personId);
}

async function deleteIncomePayEvent__save(formData: FormData) {
  const { supabase, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "");
  const { error } = await changeRecord(supabase.from("pay_events").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces();
}

async function upsertStudentLoanAccount__save(formData: FormData) {
  const { supabase, user, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "").trim() || null;
  const personId = await resolveIncomePersonId(supabase, user.id, householdContext, formData.get("person_id"));
  const planValue = String(formData.get("plan") || "plan_1");
  const plan = ["plan_1", "plan_2", "plan_4", "plan_5", "postgraduate"].includes(planValue) ? planValue : "plan_1";
  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    plan,
    current_balance: parseNumber(formData.get("current_balance")) ?? 0,
    balance_date: String(formData.get("balance_date") || new Date().toISOString().slice(0, 10)),
    interest_rate: parseNumber(formData.get("interest_rate")),
    payroll_monthly_override: parseNumber(formData.get("payroll_monthly_override")),
    notes: String(formData.get("notes") || ""),
    updated_at: new Date().toISOString(),
  };

  let response;
  let accountId = id;
  if (id) {
    response = await applyMutableRecordFilter(supabase.from("student_loan_accounts").update(payload as any), id, householdContext);
  } else {
    const { data: existingRows, error: lookupError } = await supabase
      .from("student_loan_accounts")
      .select("id")
      .or(`user_id.eq.${user.id}${householdContext.householdId ? `,and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : ""}`)
      .eq("plan", plan)
      .eq("person_id", personId)
      .limit(1);
    if (lookupError) throw new Error(lookupError.message);
    const existingId = existingRows?.[0]?.id;
    accountId = existingId || null;
    response = existingId
      ? await applyMutableRecordFilter(supabase.from("student_loan_accounts").update(payload as any), existingId, householdContext)
      : await supabase.from("student_loan_accounts").insert(payload as any).select("id").single();
    if (!existingId) accountId = response.data?.id || null;
  }

  if (response.error) throw new Error(response.error.message);
  if (accountId) {
    const { data: previous } = await supabase
      .from("student_loan_balance_events")
      .select("balance_after")
      .eq("student_loan_account_id", accountId)
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const balanceAfter = Number(payload.current_balance);
    const priorBalance = previous?.balance_after == null ? null : Number(previous.balance_after);
    const amount = priorBalance == null ? null : Number((balanceAfter - priorBalance).toFixed(2));
    const eventType = priorBalance == null ? "opening_balance" : amount != null && amount < 0 ? "repayment" : amount != null && amount > 0 ? "interest" : "balance_check";
    const { error: eventError } = await supabase.from("student_loan_balance_events").insert({
      student_loan_account_id: accountId,
      user_id: user.id,
      household_id: householdContext.householdId || null,
      person_id: personId,
      event_type: eventType,
      amount,
      balance_after: balanceAfter,
      effective_at: payload.balance_date,
      note: payload.notes || "Balance checked",
    });
    if (eventError) throw new Error(eventError.message);
  }
  revalidateIncomeSurfaces(personId);
}

async function deleteStudentLoanAccount__save(formData: FormData) {
  const { supabase, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "");
  const { error } = await applyMutableRecordFilter(supabase.from("student_loan_accounts").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces();
}

const DEDUCTION_TYPES = ["car_salary_sacrifice", "cycle_to_work", "additional_pension", "other"];

async function addIncomeDeduction__save(formData: FormData) {
  const { supabase, user, householdContext } = await requireIncomeUser();
  const personId = await resolveIncomePersonId(supabase, user.id, householdContext, formData.get("person_id"));
  const deductionTypeValue = String(formData.get("deduction_type") || "other");
  const deductionType = DEDUCTION_TYPES.includes(deductionTypeValue) ? deductionTypeValue : "other";

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: personId,
    deduction_type: deductionType,
    label: String(formData.get("label") || "Deduction"),
    monthly_amount: parseNumber(formData.get("monthly_amount")) ?? 0,
    notes: String(formData.get("notes") || ""),
    effective_from: String(formData.get("effective_from") || new Date().toISOString().slice(0, 10)),
    effective_until: String(formData.get("effective_until") || "") || null,
    taken_before_tax: formData.has("taken_before_tax") ? String(formData.get("taken_before_tax")) === "yes" : null,
  };

  const { error } = await supabase.from("income_deductions").insert(payload as any);
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces(personId);
}

async function deleteIncomeDeduction__save(formData: FormData) {
  const { supabase, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "");
  const { error } = await applyMutableRecordFilter(supabase.from("income_deductions").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces();
}


const PENSION_METHODS = ["none", "net_pay", "salary_sacrifice", "relief_at_source", "nhs_pension"];
const LOAN_PLANS = ["none", "plan_1", "plan_2", "plan_4", "plan_5", "postgraduate"];

/** Payslip panel: change one pay record's deductions without reopening the full form. */
async function updatePaySettings__save(formData: FormData) {
  const { supabase, householdContext } = await requireIncomeUser();
  const id = String(formData.get("id") || "").trim();
  if (!id) throw new Error("Missing pay record");
  const patch: Record<string, unknown> = {};
  if (formData.has("pension_method")) {
    const method = String(formData.get("pension_method"));
    if (PENSION_METHODS.includes(method)) patch.pension_method = method;
  }
  if (formData.has("pension_percent")) {
    const pct = parseNumber(formData.get("pension_percent"));
    if (pct !== null && pct !== undefined && pct >= 0 && pct <= 100) patch.pension_percent = pct;
  }
  if (formData.has("student_loan_plan")) {
    const plan = String(formData.get("student_loan_plan"));
    if (LOAN_PLANS.includes(plan)) patch.student_loan_plan = plan;
  }
  if (formData.has("tax_region")) patch.tax_region = String(formData.get("tax_region")) === "scotland" ? "scotland" : "rUK";
  if (!Object.keys(patch).length) return;
  const { error } = await changeRecord(supabase.from("pay_events").update(patch as any), id, householdContext);
  if (error) throw new Error(error.message);
  revalidateIncomeSurfaces(String(formData.get("person_id") || "") || null);
}

// Every save hands a clear message back if it fails (see lib/actions/friendly).
export async function addIncomeEntry(...args: Parameters<typeof addIncomeEntry__save>): ReturnType<typeof addIncomeEntry__save> { return runFriendly(() => addIncomeEntry__save(...args)); }
export async function updateIncomeEntry(...args: Parameters<typeof updateIncomeEntry__save>): ReturnType<typeof updateIncomeEntry__save> { return runFriendly(() => updateIncomeEntry__save(...args)); }
export async function deleteIncomeEntry(...args: Parameters<typeof deleteIncomeEntry__save>): ReturnType<typeof deleteIncomeEntry__save> { return runFriendly(() => deleteIncomeEntry__save(...args)); }
export async function addRecurringPayEvent(...args: Parameters<typeof addRecurringPayEvent__save>): ReturnType<typeof addRecurringPayEvent__save> { return runFriendly(() => addRecurringPayEvent__save(...args)); }
export async function updateRecurringPayEvent(...args: Parameters<typeof updateRecurringPayEvent__save>): ReturnType<typeof updateRecurringPayEvent__save> { return runFriendly(() => updateRecurringPayEvent__save(...args)); }
export async function deleteIncomePayEvent(...args: Parameters<typeof deleteIncomePayEvent__save>): ReturnType<typeof deleteIncomePayEvent__save> { return runFriendly(() => deleteIncomePayEvent__save(...args)); }
export async function upsertStudentLoanAccount(...args: Parameters<typeof upsertStudentLoanAccount__save>): ReturnType<typeof upsertStudentLoanAccount__save> { return runFriendly(() => upsertStudentLoanAccount__save(...args)); }
export async function deleteStudentLoanAccount(...args: Parameters<typeof deleteStudentLoanAccount__save>): ReturnType<typeof deleteStudentLoanAccount__save> { return runFriendly(() => deleteStudentLoanAccount__save(...args)); }
export async function addIncomeDeduction(...args: Parameters<typeof addIncomeDeduction__save>): ReturnType<typeof addIncomeDeduction__save> { return runFriendly(() => addIncomeDeduction__save(...args)); }
export async function deleteIncomeDeduction(...args: Parameters<typeof deleteIncomeDeduction__save>): ReturnType<typeof deleteIncomeDeduction__save> { return runFriendly(() => deleteIncomeDeduction__save(...args)); }
export async function updatePaySettings(...args: Parameters<typeof updatePaySettings__save>): ReturnType<typeof updatePaySettings__save> { return runFriendly(() => updatePaySettings__save(...args)); }
