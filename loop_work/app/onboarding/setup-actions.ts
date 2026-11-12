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
import { addPerson, inviteExistingUserToHousehold } from "@/app/household/actions";
import { addRecurringPayEvent, upsertStudentLoanAccount } from "@/app/income/actions";
import { addPlannedItem } from "@/app/spending/actions";
import { addHome, addHomeMortgageDeal } from "@/app/mortgage/actions";
import { lookupPostcode, lookupSoldPrices } from "@/lib/property/estimate";
import { quoteCouncilTax } from "@/lib/property/council-tax-rates";
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
  return new Set<string>((data || []).map((row: any) => String(row.label || "").trim().toLowerCase()));
}

async function savePay(supabase: any, userId: string, personId: string, formData: FormData, prefix: string, label: string, taxRegion: "rUK" | "scotland" = "rUK") {
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
    tax_region: taxRegion,
    pay_timing: payDay ? "fixed_day" : "last_workday",
    pay_day_of_month: payDay ?? 28,
    effective_from: new Date().toISOString().slice(0, 10),
  }));

  const balance = parseNumber(formData.get(`${prefix}_student_loan_balance`));
  if (studentLoanPlan !== "none" && balance) {
    await upsertStudentLoanAccount(form({ person_id: personId, plan: studentLoanPlan, current_balance: balance }));
  }
}

function dayOfMonth(formData: FormData, key: string, fallback = 1) {
  const day = parseNumber(formData.get(key));
  return day && day >= 1 && day <= 31 ? Math.round(day) : fallback;
}

// Your home: rent and council tax become regular bills; an owned home becomes
// a proper home record (value estimated from Land Registry sales if not
// given) and, with a mortgage, a mortgage deal. The mortgage is NOT added as a
// bill — the month plan and calendar already read it from the deal.
async function saveHome(
  supabase: any,
  userId: string,
  formData: FormData,
  labels: Set<string>,
  ownerIds: string[],
  attempt: (step: string, fn: () => Promise<unknown>) => Promise<void>,
) {
  const status = text(formData, "home_status");
  if (!status || status === "family") return;
  const postcode = text(formData, "home_postcode");

  if (status === "rent") {
    const rent = parseNumber(formData.get("rent_monthly"));
    if (rent && rent > 0 && !labels.has("rent")) {
      await attempt("your rent", () => addPlannedItem(form({
        label: "Rent", amount: rent, direction: "outgoing", recurrence: "monthly", item_type: "monthly_cost",
        day_of_month: dayOfMonth(formData, "rent_day"), payment_timing: "fixed_day",
      })));
    }
  }

  // Council tax: the amount they confirmed, else this council's charge for their band.
  let councilMonthly = parseNumber(formData.get("council_tax_monthly"));
  if (!councilMonthly && text(formData, "council_tax_band")) {
    const quote = await quoteCouncilTax(supabase, {
      band: text(formData, "council_tax_band"),
      countryCode: text(formData, "council_tax_country") || null,
      authorityCode: text(formData, "council_tax_authority_code") || null,
      authorityName: text(formData, "council_tax_authority_name") || null,
    }).catch(() => null);
    if (quote) councilMonthly = (quote.monthlyPence / 100) * (text(formData, "council_tax_single_person") === "yes" ? 0.75 : 1);
  }
  if (councilMonthly && councilMonthly > 0 && !labels.has("council tax")) {
    await attempt("council tax", () => addPlannedItem(form({
      label: "Council tax", amount: Math.round(councilMonthly! * 100) / 100, direction: "outgoing", recurrence: "monthly",
      item_type: "monthly_cost", day_of_month: 1, payment_timing: "fixed_day",
    })));
  }

  if (status !== "mortgage" && status !== "outright") return;
  const { data: existing } = await supabase.from("homes").select("id").eq("user_id", userId).eq("ownership_status", "current_home").limit(1);
  if (existing?.length) return; // already set up — edit on the Home & mortgage page

  const owners = text(formData, "home_joint") === "yes" ? ownerIds : ownerIds.slice(0, 1);
  const place = postcode ? await lookupPostcode(postcode).catch(() => null) : null;
  let value = parseNumber(formData.get("home_value"));
  let valueNote = "";
  if (!value && place?.postcode) {
    const sold = await lookupSoldPrices(place.postcode).catch(() => null);
    if (sold?.medianPricePence) {
      value = Math.round(sold.medianPricePence / 100);
      valueNote = `Starting value is the median of ${sold.count} recent sales on ${place.postcode} (HM Land Registry). Update it any time.`;
    }
  }

  let homeId: string | null = null;
  await attempt("your home", async () => {
    const fd = form({
      label: "Home",
      postcode: place?.postcode || postcode,
      house_number: text(formData, "home_house_number"),
      region: place?.region,
      city: place?.admin_district,
      country: "United Kingdom",
      latitude: place?.latitude,
      longitude: place?.longitude,
      ownership_status: "current_home",
      property_value: value ?? 0,
      estimated_value_mid: valueNote ? value : null,
      estimated_value_date: valueNote ? new Date().toISOString().slice(0, 10) : null,
      lookup_source: valueNote ? "land_registry_postcode_median" : "guided_setup",
      notes: valueNote,
    });
    for (const id of owners) fd.append("owner_ids", id);
    await addHome(fd);
    const { data } = await supabase.from("homes").select("id").eq("user_id", userId).eq("ownership_status", "current_home").order("created_at", { ascending: false }).limit(1).maybeSingle();
    homeId = data?.id || null;
  });

  if (status !== "mortgage" || !homeId) return;
  const monthly = parseNumber(formData.get("mortgage_monthly"));
  const rate = parseNumber(formData.get("mortgage_rate"));
  const balance = parseNumber(formData.get("mortgage_balance"));
  if (!monthly && !balance) return;
  const rateType = ["fixed", "tracker", "variable"].includes(text(formData, "mortgage_rate_type")) ? text(formData, "mortgage_rate_type") : "fixed";
  await attempt("your mortgage", async () => {
    const fd = form({
      home_id: homeId,
      lender: text(formData, "mortgage_lender"),
      balance: balance ?? 0,
      interest_rate: rate ?? 0,
      rate_type: rateType === "variable" ? "standard_variable" : rateType,
      repayment_type: "repayment",
      initial_period_end: rateType === "variable" ? null : text(formData, "mortgage_deal_end"),
      term_years: parseNumber(formData.get("mortgage_years_left")) ?? 25,
      monthly_payment_override: monthly,
      payment_day_of_month: dayOfMonth(formData, "mortgage_day"),
    });
    for (const id of owners) fd.append("liability_person_ids", id);
    await addHomeMortgageDeal(fd);
  });
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
    const givenEmail = text(formData, "partner_email").toLowerCase();
    partnerId = await findPersonId(supabase, user.id, "partner", partnerName);
    if (!partnerId) {
      await attempt("your partner", () => addPerson(form({ name: partnerName, relationship: "partner", email: givenEmail || null })));
      partnerId = await findPersonId(supabase, user.id, "partner", partnerName);
    }
    // Invite them to join with their own login, as a partner, if an email was given.
    const partnerEmail = givenEmail;
    if (partnerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail) && partnerEmail !== String(user.email || "").toLowerCase()) {
      await attempt("the invite to your partner", () => inviteExistingUserToHousehold(form({ invite_to: partnerEmail, permission_tier: "admin", expires_days: 14 })));
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

  // 3–4. Pay, pension and student loan. A Scottish home postcode means
  // Scottish income tax bands (the household's pay is taxed where they live).
  let taxRegion: "rUK" | "scotland" = "rUK";
  const homeCountry = text(formData, "council_tax_country");
  if (homeCountry) taxRegion = homeCountry === "SCT" ? "scotland" : "rUK";
  else if (text(formData, "home_postcode")) {
    const place = await lookupPostcode(text(formData, "home_postcode")).catch(() => null);
    if (String(place?.country || "").toLowerCase() === "scotland") taxRegion = "scotland";
  }
  if (selfId) await attempt("your pay", () => savePay(supabase, user.id, selfId, formData, "self", "Salary", taxRegion));
  else if (parseNumber(formData.get("self_gross_annual_salary")) || parseNumber(formData.get("self_monthly_take_home"))) problems.push("your pay");
  if (partnerId) await attempt("your partner's pay", () => savePay(supabase, user.id, partnerId as string, formData, "partner", `${partnerName} salary`, taxRegion));

  // 5. Your home (rent / council tax / home and mortgage records).
  const labels = await existingBillLabels(supabase, user.id);
  await attempt("your home", () => saveHome(supabase, user.id, formData, labels, [selfId, partnerId].filter(Boolean) as string[], attempt));

  // 6. Regular bills (rent and council tax rows are hidden once the home step covers them).
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

  // 7. Done — mark setup complete and show what to add next.
  // Switch on the sections their answers say they need, so a homeowner sees
  // Home & mortgage straight away rather than a settings page of toggles.
  const extrasPicked = new Set(SETUP_EXTRAS.filter((extra) => text(formData, `extra_${extra.key}`) === "yes").map((extra) => extra.key as string));
  const homeStatus = text(formData, "home_status");
  const featureFlags: Record<string, boolean> = {};
  if (homeStatus === "mortgage" || homeStatus === "outright" || extrasPicked.has("home")) featureFlags.wealth_has_mortgage = true;
  if (extrasPicked.has("pension") || text(formData, "self_has_pension") === "yes" || text(formData, "partner_has_pension") === "yes") featureFlags.wealth_has_pension = true;
  if (extrasPicked.has("savings")) featureFlags.wealth_has_savings = true;
  if (extrasPicked.has("investments")) featureFlags.wealth_has_investments = true;
  if (text(formData, "self_has_student_loan") === "yes" || text(formData, "partner_has_student_loan") === "yes") featureFlags.financial_flow_student_loan_enabled = true;
  if (parseNumber(formData.get("bill_car"))) featureFlags.wealth_has_car_finance = true;
  if (parseNumber(formData.get("bill_childcare")) || text(formData, "has_children") === "yes") featureFlags.wealth_has_childcare_costs = true;

  await supabase.from("app_user_profiles").upsert({
    user_id: user.id,
    ...featureFlags,
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
