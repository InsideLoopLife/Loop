import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { FinancialFlowWorkspaceNav } from "@/components/financial-flow/FinancialFlowWorkspaceNav";
import { AffordabilityChecker } from "@/components/affordability/AffordabilityChecker";
import { JobLossScenario } from "@/components/affordability/JobLossScenario";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { getActiveHouseholdContext, householdPeopleOrFilter, visibleDataOrFilter } from "@/lib/auth/household-context";
import { loadMonthPlans, monthsFrom, monthTotals } from "@/lib/planning/load-month-plans";

export const metadata = { title: "Can I afford it? · Loop" };

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

export default async function CanIAffordPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) || {};
  const lostParam = typeof params.lost === "string" ? params.lost : null;
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) redirect("/login");
  const household = await getActiveHouseholdContext(supabase, user);
  const filter = visibleDataOrFilter(household);
  const months = monthsFrom(currentMonth(), 36);

  const [{ plans, savingNames }, { data: accounts }, { data: categories }, { data: jobRows }, { data: payRows }, { data: peopleRows }] = await Promise.all([
    loadMonthPlans(supabase, { userId: user.id, filter, months }),
    supabase.from("financial_accounts").select("account_type, current_balance, is_liability").or(filter),
    supabase.from("spending_categories").select("name, emergency_fund_essential, spending_category_groups(emergency_fund_essential)").or(filter),
    supabase.from("employment_jobs").select("id, person_id, employer_name, employment_type, start_date, end_date, work_region, pay_event_id, enhanced_redundancy_mode, enhanced_weeks_per_year, enhanced_max_weeks, enhanced_fixed_amount, notice_weeks_override").or(filter).order("start_date"),
    supabase.from("pay_events").select("id, person_id, label, pay_kind, gross_annual_salary, effective_from, effective_until").or(filter),
    supabase.from("people").select("id, name, relationship, birth_date").or(householdPeopleOrFilter(household)),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const jobs = ((jobRows || []) as any[]).filter((job) => !job.end_date || job.end_date >= today);

  // Same savings figure as Summary's safety net: money in savings accounts (not pensions or investments).
  const savingsNow = (accounts || [])
    .filter((a: any) => !a.is_liability && ["savings", "cash_isa", "fixed_saver", "regular_saver"].includes(String(a.account_type)))
    .reduce((sum: number, a: any) => sum + Math.abs(Number(a.current_balance || 0)), 0);

  // Safety buffer: three months of essential bills (or of all bills, if nothing is marked essential).
  const essentialNames = new Set((categories || []).filter((c: any) => {
    const groups = Array.isArray(c.spending_category_groups) ? c.spending_category_groups : c.spending_category_groups ? [c.spending_category_groups] : [];
    return Boolean(c.emergency_fund_essential || groups.some((g: any) => g.emergency_fund_essential));
  }).map((c: any) => c.name));
  const thisMonth = plans[0];
  const essentialMonthly = thisMonth ? thisMonth.outgoingItems.filter((item: any) => item.categoryLabel && essentialNames.has(item.categoryLabel)).reduce((s: number, item: any) => s + Number(item.value || 0), 0) : 0;
  const totals = plans.map((plan) => monthTotals(plan, savingNames));
  const monthlyBills = totals[0]?.spending || 0;
  const bufferBase = essentialMonthly > 0 ? essentialMonthly : monthlyBills;

  return (
    <>
      <Nav />
      <FinancialFlowWorkspaceNav section="afford" month={null} />
      <main className="mx-auto w-[95vw] max-w-[1240px] px-4 py-6">
        <AffordabilityChecker
          months={months}
          forecast={plans.map((plan, i) => ({ month: months[i], leftOver: Math.round(totals[i].leftOver * 100) / 100, income: Math.round(totals[i].income * 100) / 100 }))}
          savingsNow={Math.round(savingsNow * 100) / 100}
          buffer={Math.round(bufferBase * 3 * 100) / 100}
          bufferBasis={essentialMonthly > 0 ? "essential" : "all"}
          bufferMonthly={Math.round(bufferBase * 100) / 100}
        />
        <JobLossScenario
          jobs={jobs}
          people={((peopleRows || []) as any[]).map((p) => ({ id: p.id, name: p.name, relationship: p.relationship, birth_date: p.birth_date || null }))}
          pays={((payRows || []) as any[]).map((p) => ({ ...p, gross_annual_salary: Number(p.gross_annual_salary) || 0 }))}
          forecast={plans.map((plan, i) => {
            const payByPerson: Record<string, number> = {};
            for (const item of plan.incomeItems) {
              if (!item.payEventId || !item.personId) continue;
              payByPerson[item.personId] = Math.round(((payByPerson[item.personId] || 0) + Number(item.value || 0)) * 100) / 100;
            }
            return { month: months[i], leftOver: Math.round(totals[i].leftOver * 100) / 100, payByPerson };
          })}
          savingsNow={Math.round(savingsNow * 100) / 100}
          today={today}
          initialJobId={lostParam}
        />
      </main>
    </>
  );
}
