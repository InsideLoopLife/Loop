"use server";

// Guided setup: one form, saved through the SAME server actions the full
// pages use (account profile, people, pay events, student loans, planned
// items). No calculation logic lives here — this only gathers answers and
// hands them to the existing writers in the right order, so tax, NI,
// student-loan, affordability and cashflow logic all run exactly as before.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { saveAccountProfile } from "@/app/account/actions";
import { addPerson } from "@/app/household/actions";
import { addRecurringPayEvent, upsertStudentLoanAccount } from "@/app/income/actions";
import { addPlannedItem } from "@/app/spending/actions";
import { SETUP_BILLS, SETUP_EXTRAS } from "@/lib/onboarding/setup-options";
import { syncCalendarForUser } from "@/lib/calendar/sync-all";
import { NHS_EMPLOYER_CONTRIBUTION_PERCENT_2026_27, nhsMemberContributionPercent } from "@/lib/calculations/nhs-pension";

const STUDENT_LOAN_PLANS = ["plan_1", "plan_2", "plan_4", "plan_5", "postgraduate"];

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function form(values: Record<string, string | number | null | undefined>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    fd.set(key, String(value));
  }
  return fd;
}

async function findPersonId(supabase: any, userId: string, relationship: string, name?: string) {
  let query = supabase
    .from("people")
    .select("id")
    .eq("relationship", relationship)
    .is("active_until", null)
    .order("created_at", { ascending: false })
    .limit(1);
  query = relationship === "self" ? query.or(`linked_user_id.eq.${userId},user_id.eq.${userId}`) : query.eq("user_id", userId);
  if (name) query = query.ilike("name", name);
  const { data } = await query.maybeSingle();
  return (data?.id as string | undefined) || null;
}

async function hasActivePayEvent(supabase: any, personId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("pay_events")
    .select("id")
    .eq("person_id", personId)
    .or(`effective_until.is.null,effective_until.gte.${today}`)
    .limit(1);
  return Boolean(data?.length);
}

async function existingBillLabels(supabase: any, userId: string) {
  const { data } = await supabase.from("planned_items").select("label").eq("user_id", userId).limit(500);
  return new Set((data || []).map((row: any) => String(row.label || "").trim().toLowerCase()));
}

async function savePay(supabase: any, userId: string, personId: string, formData: FormData, prefix: string, label: string) {
  const gross = parseNumber(formData.get(`${prefix}_gross_annual_salary`));
  const takeHome = parseNumber(formData.get(`${prefix}_monthly_take_home`));
  if (!gross && !takeHome) return;
  if (await hasActivePayEvent(supabase, personId)) return; // already set up — edit on the Income page

  const planRaw = text(formData, `${prefix}_student_loan_plan`);
  const studentLoanPlan = text(formData, `${prefix}_has_student_loan`) === "yes" && STUDENT_LOAN_PLANS.includes(planRaw) ? planRaw : "none";
  const payDay = parseNumber(formData.get(`${prefix}_pay_day`));
  const inPension = text(formData, `${prefix}_has_pension`) === "yes";
  const isNhs = text(formData, `${prefix}_employer`) === "nhs";
  // NHS contributions are set by salary tier, so work the rate out here rather
  // than trusting the browser. Uses the existing nhs_pension method, which the
  // tax logic already treats as a before-tax (net pay) deduction.
  const pensionMethod = inPension && isNhs ? "nhs_pension" : "net_pay";
  const pensionPercent = !inPension ? 0 : isNhs ? (gross ? nhsMemberContributionPercent(gross) : 0) : parseNumber(formData.get(`${prefix}_pension_percent`)) ?? 5;

  await addRecurringPayEvent(form({
    person_id: personId,
    label,
    pay_kind: "salary",
    gross_annual_salary: gross ?? 0,
    monthly_take_home_override: gross ? null : takeHome,
    pension_percent: pensionPercent,
    pension_method: pensionMethod,
    employer_pension_percent: inPension && isNhs ? NHS_EMPLOYER_CONTRIBUTION_PERCENT_2026_27 : null,
    student_loan_plan: studentLoanPlan,
    pay_timing: payDay ? "fixed_day" : "last_workday",
    pay_day_of_month: payDay ?? 28,
    effective_from: new Date().toISOString().slice(0, 10),
  }));

  const balance = parseNumber(formData.get(`${prefix}_student_loan_balance`));
  if (studentLoanPlan !== "none" && balance) {
    await upsertStudentLoanAccount(form({ person_id: personId, plan: studentLoanPlan, current_balance: balance }));
  }
}

export async function completeGuidedSetup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const problems: string[] = [];
  const attempt = async (step: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error: any) {
      // redirect() inside a nested action throws NEXT_REDIRECT — never swallow it.
      if (String(error?.digest || error?.message || "").startsWith("NEXT_REDIRECT")) throw error;
      problems.push(step);
      console.error(`[guided-setup] ${step} failed`, error);
    }
  };

  // 1. You — profile, household and your own "self" person (saveAccountProfile does all three).
  const { data: profile } = await supabase.from("app_user_profiles").select("*").eq("user_id", user.id).maybeSingle();
  const name = text(formData, "name") || profile?.display_name || profile?.full_name || "";
  await attempt("your name", () => saveAccountProfile(form({
    display_name: name,
    timezone: profile?.timezone || "Europe/London",
    currency: profile?.currency || "GBP",
    date_display_format: profile?.date_display_format,
    default_person_image_mode: profile?.default_person_image_mode,
    spending_person_display_mode: profile?.spending_person_display_mode,
    spending_date_format: profile?.spending_date_format,
    spending_bill_logo_mode: profile?.spending_bill_logo_mode,
    money_display_precision: profile?.money_display_precision,
    dashboard_home_view: profile?.dashboard_home_view,
  })));

  const selfId = await findPersonId(supabase, user.id, "self");

  // 2. Who you live with.
  const partnerName = text(formData, "partner_name");
  let partnerId: string | null = null;
  if (text(formData, "has_partner") === "yes" && partnerName) {
    partnerId = await findPersonId(supabase, user.id, "partner", partnerName);
    if (!partnerId) {
      await attempt("your partner", () => addPerson(form({ name: partnerName, relationship: "partner" })));
      partnerId = await findPersonId(supabase, user.id, "partner", partnerName);
    }
  }
  if (text(formData, "has_children") === "yes") {
    for (let i = 0; i < 6; i++) {
      const childName = text(formData, `child_${i}_name`);
      if (!childName) continue;
      if (await findPersonId(supabase, user.id, "child", childName)) continue;
      await attempt(`child ${childName}`, () => addPerson(form({
        name: childName,
        relationship: "child",
        birth_date: text(formData, `child_${i}_birth_date`),
      })));
    }
  }

  // 3–4. Pay, pension and student loan.
  if (selfId) await attempt("your pay", () => savePay(supabase, user.id, selfId, formData, "self", "Salary"));
  else if (parseNumber(formData.get("self_gross_annual_salary")) || parseNumber(formData.get("self_monthly_take_home"))) problems.push("your pay");
  if (partnerId) await attempt("your partner's pay", () => savePay(supabase, user.id, partnerId as string, formData, "partner", `${partnerName} salary`));

  // 5. Regular bills.
  const labels = await existingBillLabels(supabase, user.id);
  for (const bill of SETUP_BILLS) {
    const amount = parseNumber(formData.get(`bill_${bill.key}`));
    if (!amount || amount <= 0 || labels.has(bill.label.toLowerCase())) continue;
    await attempt(bill.label, () => addPlannedItem(form({
      label: bill.label,
      amount,
      direction: "outgoing",
      recurrence: "monthly",
      item_type: "monthly_cost",
      day_of_month: parseNumber(formData.get(`bill_${bill.key}_day`)) ?? 1,
      payment_timing: "fixed_day",
    })));
  }

  // 6. Done — mark setup complete and show what to add next.
  await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    onboarding_completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  // Fill the calendar now rather than waiting for tomorrow's daily run.
  await attempt("your calendar", () => syncCalendarForUser(supabase as any, user.id));

  const extras = SETUP_EXTRAS.filter((extra) => text(formData, `extra_${extra.key}`) === "yes").map((extra) => extra.key);
  revalidatePath("/", "layout");
  const params = new URLSearchParams();
  if (extras.length) params.set("next", extras.join(","));
  if (problems.length) params.set("problems", problems.join("|"));
  redirect(`/onboarding/done${params.size ? `?${params}` : ""}`);
}
