import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { StatCard } from "@/components/StatCard";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { PersonCalendarPlanner } from "@/components/household/PersonCalendarPlanner";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format/money";
import { formatPersonDate, DateDisplayFormat } from "@/lib/format/date";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
import { updatePersonProfile } from "../actions";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  birth_date: string | null;
  active_from: string | null;
  active_until: string | null;
  notes: string | null;
  avatar_url: string | null;
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
      payMode: event.maternity_pay_mode ?? "spread_equal",
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
  return "id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate";
}

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [{ data: person }, { data: payEvents }, { data: childCosts }, { data: profile }] = await Promise.all([
    supabase
      .from("people")
      .select("id, name, relationship, birth_date, active_from, active_until, notes, avatar_url")
      .eq("id", personId)
      .or(visibleDataOrFilter(householdContext))
      .maybeSingle<Person>(),
    supabase
      .from("pay_events")
      .select(payEventSelectFields())
      .eq("person_id", personId)
      .or(visibleDataOrFilter(householdContext))
      .order("effective_from", { ascending: false })
      .returns<PayEvent[]>(),
    supabase
      .from("child_costs")
      .select("id, child_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on")
      .eq("child_id", personId)
      .or(visibleDataOrFilter(householdContext))
      .order("starts_on", { ascending: false })
      .returns<ChildCost[]>(),
    supabase
      .from("app_user_profiles")
      .select("date_display_format, default_person_image_mode")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!person) notFound();

  const dateDisplayFormat = (profile?.date_display_format || "age_and_date") as DateDisplayFormat;
  const useImages = (profile?.default_person_image_mode || "avatar_url") !== "initials";
  const payRows = payEvents ?? [];
  const childCostRows = childCosts ?? [];
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
                <img src={person.avatar_url} alt="" className="h-20 w-20 rounded-[1.75rem] object-cover shadow-sm" />
              ) : (
                <span className="grid h-20 w-20 place-items-center rounded-[1.75rem] bg-white/80 text-3xl font-black text-slate-700 shadow-sm">{person.name.slice(0, 1).toUpperCase()}</span>
              )}
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-slate-950">{person.name}</h1>
                <p className="mt-1 text-sm capitalize text-slate-600">{person.relationship}</p>
                {person.birth_date ? <p className="mt-1 text-sm font-semibold text-slate-600">{formatPersonDate(person.birth_date, dateDisplayFormat)}</p> : null}
              </div>
            </div>
            <div className="text-sm text-slate-600">
              <p>Active from: {person.active_from ?? "not set"}</p>
              {person.active_until ? <p>Active until: {person.active_until}</p> : null}
            </div>
          </div>
        </section>

        <details className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm">
          <summary className="cursor-pointer list-none text-sm font-black text-slate-800 [&::-webkit-details-marker]:hidden">Edit profile basics</summary>
          <form action={updatePersonProfile} className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="id" value={person.id} />
            <label className="block"><span className="text-sm font-black text-slate-700">Name</span><input name="name" defaultValue={person.name} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Relationship</span><select name="relationship" defaultValue={person.relationship} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"><option value="self">Self</option><option value="partner">Partner</option><option value="child">Child</option><option value="other">Other</option></select></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Birth date</span><input name="birth_date" type="date" defaultValue={person.birth_date ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Image URL</span><input name="avatar_url" defaultValue={person.avatar_url ?? ""} placeholder="Optional profile image URL" className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Active from</span><input name="active_from" type="date" defaultValue={person.active_from ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block"><span className="text-sm font-black text-slate-700">Active until</span><input name="active_until" type="date" defaultValue={person.active_until ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <label className="block lg:col-span-2"><span className="text-sm font-black text-slate-700">Notes</span><input name="notes" defaultValue={person.notes ?? ""} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" /></label>
            <div className="flex items-end"><SubmitButton>Save profile</SubmitButton></div>
          </form>
        </details>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title={isChild ? "Active monthly costs" : "Active gross income"} value={formatMoney(isChild ? activeChildCosts : activeGross)} helper={isChild ? "Child costs active today" : "Annual gross from active pay events"} />
          <StatCard title={isChild ? "Cost lines" : "Estimated take-home"} value={isChild ? String(childCostRows.length) : formatMoney(activeNet)} helper={isChild ? "Nursery/clubs/wraparound" : "This month rough estimate"} />
          <StatCard title="Active status" value={person.active_until ? "Ending" : "Active"} helper={person.active_until ? `Until ${person.active_until}` : "No end date set"} />
        </section>

        <PersonCalendarPlanner
          person={{ id: person.id, name: person.name, relationship: person.relationship }}
          payEvents={payRows}
          childCosts={childCostRows}
        />
      </main>
    </>
  );
}
