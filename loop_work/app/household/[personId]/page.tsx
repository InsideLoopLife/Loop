import { ProfileImageFileInput } from "@/components/ProfileImageFileInput";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { StatCard } from "@/components/StatCard";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { PersonCalendarPlanner } from "@/components/household/PersonCalendarPlanner";
import { createClient } from "@/lib/supabase/server";
import { processPendingHouseholdLinksForUser } from "@/lib/auth/invite-linking";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { formatMoneyExact } from "@/lib/format/money";
import { formatPersonDate, DateDisplayFormat } from "@/lib/format/date";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
import { requestProfileDataHandover, updatePersonProfile } from "../actions";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";

type Person = {
  id: string;
  user_id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  birth_date: string | null;
  active_from: string | null;
  active_until: string | null;
  notes: string | null;
  avatar_url: string | null;
  email: string | null;
  linked_user_id: string | null;
  account_status: string | null;
  invite_email: string | null;
  income_visible_to_household: boolean | null;
  costs_visible_to_household: boolean | null;
  household_can_add_costs: boolean | null;
  maturity_date: string | null;
};

type PayEvent = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: PensionMethod | null;
  student_loan_plan: StudentLoanPlan;
  effective_from: string;
  effective_until: string | null;
  pay_timing: string | null;
  pay_day_of_month: number | null;
  pay_adjustment: string | null;
  maternity_scheme: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: MaternityPayMode | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
  overrides?: PayEventOverride[];
};


type PayEventOverride = {
  id: string;
  pay_event_id: string | null;
  person_id: string | null;
  month: string;
  statutory_pay: number | null;
  occupational_pay: number | null;
  gross_pay: number | null;
  net_pay_override: number | null;
  notes: string | null;
};

type IncomeEntry = {
  id: string;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};

type PlannedItem = {
  id: string;
  person_id: string | null;
  direction: "income" | "outgoing";
  item_type: string;
  label: string;
  amount: number;
  recurrence: "monthly" | "four_weekly" | "custom_interval" | "one_off";
  recurrence_interval_days?: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_timing: string | null;
  payment_adjustment: string | null;
};

type ChildCost = {
  id: string;
  child_id: string | null;
  label: string;
  cost_kind: "fixed" | "nursery" | "activity" | null;
  monthly_cost: number;
  billing_month: string | null;
  daily_rate: number | null;
  extra_daily_cost: number | null;
  funded_hours_per_week: number | null;
  funding_mode: FundingMode | null;
  hourly_funding_credit: number | null;
  term_weeks_per_year: number | null;
  billing_schedule: BillingSchedule | null;
  bank_holidays_are_free: boolean | null;
  tax_free_childcare_enabled: boolean | null;
  tax_free_childcare_cap_per_quarter: number | null;
  part_day_multiplier: number | null;
  full_day_hours: number | null;
  part_day_hours: number | null;
  monday_session: DaySession | null;
  tuesday_session: DaySession | null;
  wednesday_session: DaySession | null;
  thursday_session: DaySession | null;
  friday_session: DaySession | null;
  activity_weekly_cost: number | null;
  activity_weekday: number | null;
  activity_billing_mode: ActivityBillingMode | null;
  activity_term_weeks_per_year: number | null;
  payment_timing?: "fixed_day" | "last_workday" | null;
  payment_day_of_month?: number | null;
  payment_adjustment?: "previous_workday" | "next_workday" | "none" | null;
  monday_hours: number | null;
  tuesday_hours: number | null;
  wednesday_hours: number | null;
  thursday_hours: number | null;
  friday_hours: number | null;
  starts_on: string;
  ends_on: string | null;
};

function isActiveRange(start: string, end: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  return start <= today && (!end || end >= today);
}

function currentBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getPayMonthlyNet(event: PayEvent, month = currentBillingMonth()) {
  const override = event.overrides?.find((item) => item.month === month);
  if (override) {
    if (override.net_pay_override !== null && override.net_pay_override !== undefined) return Number(override.net_pay_override);
    if (override.gross_pay !== null && override.gross_pay !== undefined) return Number(override.gross_pay);
    return Number(override.statutory_pay ?? 0) + Number(override.occupational_pay ?? 0);
  }

  if (event.pay_kind === "maternity") {
    return calculateNhsMaternityMonthlyAmount({
      month,
      grossAnnualSalary: Number(event.gross_annual_salary),
      leaveStart: event.maternity_leave_start ?? event.effective_from,
      leaveEnd: event.maternity_leave_end ?? event.effective_until ?? event.effective_from,
      fullPayWeeks: Number(event.maternity_full_pay_weeks ?? 8),
      halfPayWeeks: Number(event.maternity_half_pay_weeks ?? 18),
      smpOnlyWeeks: Number(event.maternity_smp_only_weeks ?? 13),
      unpaidWeeks: Number(event.maternity_unpaid_weeks ?? 13),
      smpWeeklyRate: Number(event.maternity_smp_weekly_rate ?? 194.32),
      payMode: event.maternity_pay_mode ?? "nhs_spread_occupational_actual_smp",
      pensionPercent: Number(event.pension_percent),
      pensionMethod: event.pension_method ?? "net_pay",
      studentLoanPlan: event.student_loan_plan,
    }).estimatedNetAmount;
  }

  if (event.monthly_take_home_override !== null && event.monthly_take_home_override !== undefined) {
    return Number(event.monthly_take_home_override);
  }

  return estimateAnnualTakeHome({
    grossAnnual: Number(event.gross_annual_salary),
    pensionPercent: Number(event.pension_percent),
    pensionMethod: event.pension_method ?? "net_pay",
    studentLoanPlan: event.student_loan_plan,
  }).monthlyTakeHome;
}

function getChildCostMonthlyAmount(cost: ChildCost, billingMonth = currentBillingMonth()) {
  if (cost.cost_kind === "activity") {
    return calculateActivityMonthlyCost({
      billingMonth,
      weeklyCost: Number(cost.activity_weekly_cost ?? cost.monthly_cost ?? 0),
      activityWeekday: Number(cost.activity_weekday ?? 6),
      activityBillingMode: cost.activity_billing_mode ?? "calendar",
      activityTermWeeksPerYear: Number(cost.activity_term_weeks_per_year ?? 38),
      bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    }).estimatedMonthlyCost;
  }

  if (cost.cost_kind !== "nursery") return Number(cost.monthly_cost ?? 0);

  return calculateNurseryMonthlyCost({
    billingMonth,
    dailyRate: Number(cost.daily_rate ?? 0),
    extraDailyCost: Number(cost.extra_daily_cost ?? 0),
    fundedHoursPerWeek: Number(cost.funded_hours_per_week ?? 0),
    fundingMode: cost.funding_mode ?? "none",
    hourlyFundingCredit: Number(cost.hourly_funding_credit ?? 0),
    termWeeksPerYear: Number(cost.term_weeks_per_year ?? 38),
    billingSchedule: cost.billing_schedule ?? "all_year",
    bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    taxFreeChildcareEnabled: Boolean(cost.tax_free_childcare_enabled),
    taxFreeChildcareCapPerQuarter: Number(cost.tax_free_childcare_cap_per_quarter ?? 500),
    partDayMultiplier: Number(cost.part_day_multiplier ?? 0.5),
    fullDayHours: Number(cost.full_day_hours ?? 10),
    partDayHours: Number(cost.part_day_hours ?? 5),
    mondaySession: cost.monday_session ?? "off",
    tuesdaySession: cost.tuesday_session ?? "off",
    wednesdaySession: cost.wednesday_session ?? "off",
    thursdaySession: cost.thursday_session ?? "off",
    fridaySession: cost.friday_session ?? "off",
    mondayHours: Number(cost.monday_hours ?? 0),
    tuesdayHours: Number(cost.tuesday_hours ?? 0),
    wednesdayHours: Number(cost.wednesday_hours ?? 0),
    thursdayHours: Number(cost.thursday_hours ?? 0),
    fridayHours: Number(cost.friday_hours ?? 0),
  }).estimatedMonthlyCost;
}

function headerClasses(relationship: Person["relationship"]) {
  if (relationship === "child") return "border-sky-200 bg-sky-100/50";
  if (relationship === "self" || relationship === "partner") return "border-orange-200 bg-orange-50";
  return "border-slate-200 bg-white";
}

function payEventSelectFields() {
  return "id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, pay_timing, pay_day_of_month, pay_adjustment, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate";
}

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await processPendingHouseholdLinksForUser({ userId: user.id, email: user.email });
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId;
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const dataClient = supabase;

  const [{ data: person }, { data: payEvents }, { data: childCosts }, { data: incomeEntries }, { data: plannedItems }, { data: profile }, { data: payOverrides }] = await Promise.all([
    dataClient
      .from("people")
      .select("id, user_id, name, relationship, birth_date, active_from, active_until, notes, avatar_url, email, linked_user_id, account_status, invite_email, income_visible_to_household, costs_visible_to_household, household_can_add_costs, maturity_date")
      .eq("id", personId)
      .or(householdVisibleFilter)
      .maybeSingle<Person>(),
    dataClient
      .from("pay_events")
      .select(payEventSelectFields())
      .eq("person_id", personId)
      .or(householdVisibleFilter)
      .order("effective_from", { ascending: false })
      .returns<PayEvent[]>(),
    dataClient
      .from("child_costs")
      .select("id, child_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, payment_timing, payment_day_of_month, payment_adjustment, starts_on, ends_on")
      .eq("child_id", personId)
      .or(householdVisibleFilter)
      .order("starts_on", { ascending: false })
      .returns<ChildCost[]>(),
    dataClient
      .from("income_entries")
      .select("id, person_id, label, gross_amount, net_amount, frequency, entry_date")
      .eq("person_id", personId)
      .or(householdVisibleFilter)
      .order("entry_date", { ascending: false })
      .returns<IncomeEntry[]>(),
    dataClient
      .from("planned_items")
      .select("id, person_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment")
      .eq("person_id", personId)
      .or(householdVisibleFilter)
      .order("start_date", { ascending: false })
      .returns<PlannedItem[]>(),
    supabase
      .from("app_user_profiles")
      .select("date_display_format, default_person_image_mode")
      .eq("user_id", user.id)
      .maybeSingle(),
    dataClient
      .from("pay_event_monthly_overrides")
      .select("id, pay_event_id, person_id, month, statutory_pay, occupational_pay, gross_pay, net_pay_override, notes")
      .eq("person_id", personId)
      .or(householdVisibleFilter)
      .returns<PayEventOverride[]>(),
  ]);

  if (!person) notFound();

  const dateDisplayFormat = (profile?.date_display_format || "age_and_date") as DateDisplayFormat;
  const useImages = (profile?.default_person_image_mode || "avatar_url") !== "initials";
  const overrideRows = (payOverrides ?? []) as PayEventOverride[];
  const overridesByEvent = new Map<string, PayEventOverride[]>();
  for (const override of overrideRows) {
    if (!override.pay_event_id) continue;
    const current = overridesByEvent.get(override.pay_event_id) || [];
    current.push(override);
    overridesByEvent.set(override.pay_event_id, current);
  }
  const payRows = (payEvents ?? []).map((event) => ({ ...event, overrides: overridesByEvent.get(event.id) || [] }));
  const childCostRows = childCosts ?? [];
  const incomeEntryRows = incomeEntries ?? [];
  const plannedItemRows = plannedItems ?? [];
  const activePay = payRows.filter((event) => isActiveRange(event.effective_from, event.effective_until));
  const activeCosts = childCostRows.filter((cost) => isActiveRange(cost.starts_on, cost.ends_on));

  const activeGross = activePay.reduce((sum, event) => sum + Number(event.gross_annual_salary), 0);
  const activeNet = activePay.reduce((sum, event) => sum + getPayMonthlyNet(event), 0);
  const activeChildCosts = activeCosts.reduce((sum, cost) => sum + getChildCostMonthlyAmount(cost), 0);
  const isChild = person.relationship === "child";

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <Link href="/household" className="text-sm font-semibold text-slate-600 hover:text-slate-950">← Back to household</Link>

        <section className={`rounded-3xl border p-6 shadow-sm ${headerClasses(person.relationship)}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Person profile</p>
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              {useImages && person.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={person.avatar_url} alt="" referrerPolicy="no-referrer" className="h-20 w-20 rounded-[1.75rem] object-cover shadow-sm" />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-[1.75rem] bg-white/80 text-3xl font-black text-slate-700 shadow-sm">{person.name.slice(0, 1).toUpperCase()}</span>
              )}
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-slate-950">{person.name}</h1>
                <p className="mt-1 text-sm capitalize text-slate-600">{person.relationship}</p>
                {person.birth_date ? <p className="mt-1 text-sm font-semibold text-slate-600">{formatPersonDate(person.birth_date, dateDisplayFormat)}</p> : null}
              </div>
            </div>
            <div className="rounded-3xl bg-white/70 p-4 text-sm font-semibold text-slate-600 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Account link</p>
              <p className="mt-1 text-slate-900">{person.linked_user_id ? "Own login linked" : (person.account_status || "managed_by_household").replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs text-slate-500">{person.email || "No email set yet"}</p>
            </div>
          </div>
        </section>

        <SectionCard title="Account & household visibility" description="Each person can eventually have their own login. Until linked, the household owner manages the profile on their behalf.">
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Profile account</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{person.linked_user_id ? "Linked account" : "Managed profile"}</h2>
              <p className="mt-2 text-sm text-slate-600">{person.linked_user_id ? "This person controls their own password, MFA and account details from their Account page." : "This profile is currently controlled by the household owner. Passwords cannot be viewed here because they live in Supabase Auth."}</p>
              <div className="mt-4 grid gap-2 text-sm">
                <p><span className="font-black text-slate-700">Email:</span> {person.email || person.invite_email || "Not set"}</p>
                <p><span className="font-black text-slate-700">Status:</span> {(person.account_status || "managed_by_household").replaceAll("_", " ")}</p>
                {person.relationship === "child" ? <p><span className="font-black text-slate-700">Maturity:</span> {person.maturity_date || "Account handover can be set nearer 18"}</p> : null}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Account linking</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Invite, QR and keep-data prompts</h2>
              <p className="mt-2 text-sm text-slate-600">
                Account setup is now handled from the household invite link/QR flow. When this person joins with their own login, use the keep-data prompt below to ask them whether to claim the profile, income, costs and nutrition entries you created for them.
              </p>
              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                No password or account prompt is created from this page anymore, which avoids duplicate login/profile states.
              </div>
            </div>
            {person.linked_user_id && person.user_id !== person.linked_user_id && householdContext.canManagePeople ? (
              <form action={requestProfileDataHandover} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm lg:col-span-2">
                <input type="hidden" name="person_id" value={person.id} />
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Data handover</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Ask {person.name} to keep this profile data</h2>
                <p className="mt-2 text-sm font-semibold text-emerald-900/75">
                  This sends {person.name} a notification saying you have added information for them in this household. They can accept to add the profile, income/cost lines and linked entries to their own account, or decline and leave the data managed by the household.
                </p>
                <label className="mt-4 block">
                  <span className="text-sm font-black text-emerald-800">Optional message</span>
                  <input name="message" defaultValue={`Dan from ${householdContext.householdName || "your household"} has put this in for you. Do you want to keep it and add it to your own profile?`} className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold" />
                </label>
                <div className="mt-4"><SubmitButton>Send keep-data prompt</SubmitButton></div>
              </form>
            ) : null}
          </div>
          <div className="mt-4 grid gap-3 rounded-3xl bg-slate-50 p-4 md:grid-cols-3">
            <div><p className="text-xs font-black uppercase text-slate-500">Income visibility</p><p className="font-black text-slate-950">{person.income_visible_to_household ? "Shared to household" : "Private to person"}</p></div>
            <div><p className="text-xs font-black uppercase text-slate-500">Cost visibility</p><p className="font-black text-slate-950">{person.costs_visible_to_household ? "Visible" : "Private"}</p></div>
            <div><p className="text-xs font-black uppercase text-slate-500">Household can add costs</p><p className="font-black text-slate-950">{person.household_can_add_costs ? "Allowed" : "Person only"}</p></div>
          </div>
        </SectionCard>

        <details className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm">
          <summary className="cursor-pointer list-none text-sm font-black text-slate-800 [&::-webkit-details-marker]:hidden">Edit profile basics</summary>
          <form action={updatePersonProfile} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="id" value={person.id} />
            <label className="block"><span className="text-sm font-black text-slate-700">Name</span><input name="name" defaultValue={person.name} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Relationship</span><select name="relationship" defaultValue={person.relationship} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"><option value="self">Self</option><option value="partner">Partner</option><option value="child">Child</option><option value="other">Other</option></select></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Birth date</span><input name="birth_date" type="date" defaultValue={person.birth_date ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Email / future login</span><input name="email" type="email" defaultValue={person.email ?? person.invite_email ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Account status</span><select name="account_status" defaultValue={person.account_status ?? "managed_by_household"} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"><option value="managed_by_household">Managed by household</option><option value="invite_needed">Invite/setup needed</option><option value="invited">Invited</option><option value="linked">Linked login</option><option value="child_until_18">Child until 18</option><option value="removed_from_household">Removed from household</option></select></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Maturity / handover date</span><input name="maturity_date" type="date" defaultValue={person.maturity_date ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <input type="hidden" name="avatar_url" value={person.avatar_url ?? ""} /><ProfileImageFileInput name="avatar_file" />
            <input type="hidden" name="active_from" value={person.active_from ?? ""} />
            <input type="hidden" name="active_until" value={person.active_until ?? ""} />
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><input type="checkbox" name="income_visible_to_household" value="true" defaultChecked={person.income_visible_to_household ?? true} /> Share income with household</label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><input type="checkbox" name="costs_visible_to_household" value="true" defaultChecked={person.costs_visible_to_household ?? true} /> Share costs with household</label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><input type="checkbox" name="household_can_add_costs" value="true" defaultChecked={person.household_can_add_costs ?? true} /> Household can add costs</label>
            <label className="block lg:col-span-2"><span className="text-sm font-black text-slate-700">Notes</span><input name="notes" defaultValue={person.notes ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <div className="flex items-end"><SubmitButton>Save profile</SubmitButton></div>
          </form>
        </details>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title={isChild ? "Active monthly costs" : "Active gross income"} value={formatMoneyExact(isChild ? activeChildCosts : activeGross)} helper={isChild ? "Child costs active today" : "Annual gross from active pay events"} />
          <StatCard title={isChild ? "Cost lines" : "Estimated take-home"} value={isChild ? String(childCostRows.length) : formatMoneyExact(activeNet)} helper={isChild ? "Nursery/clubs/wraparound" : "This month rough estimate"} />
          <StatCard title="Visibility" value="Household" helper="Income/cost visibility can be controlled as household sharing matures" />
        </section>

        <PersonCalendarPlanner
          person={{ id: person.id, name: person.name, relationship: person.relationship }}
          payEvents={payRows}
          childCosts={childCostRows}
          incomeEntries={incomeEntryRows}
          plannedItems={plannedItemRows}
        />
      </main>
    </>
  );
}
