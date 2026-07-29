import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { IncomeTrackerClient } from "@/components/income/IncomeTrackerClient";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

type IncomeEntry = {
  id: string;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};

type Person = { id: string; name: string; relationship: string };
type PayEvent = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: string | null;
  student_loan_plan: string;
  effective_from: string;
  effective_until: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: string | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
};

export default async function IncomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [{ data: entries }, { data: people }, { data: payEvents }] = await Promise.all([
    supabase.from("income_entries").select("id, person_id, label, gross_amount, net_amount, frequency, entry_date").or(visibleDataOrFilter(householdContext)).order("entry_date", { ascending: false }).returns<IncomeEntry[]>(),
    supabase.from("people").select("id, name, relationship").or(visibleDataOrFilter(householdContext)).or("account_status.is.null,account_status.neq.duplicate_merged").order("relationship").returns<Person[]>(),
    supabase
      .from("pay_events")
      .select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate")
      .or(visibleDataOrFilter(householdContext))
      .order("effective_from", { ascending: false })
      .returns<PayEvent[]>(),
  ]);

  return (
    <>
      <Nav />
      <IncomeTrackerClient entries={entries ?? []} people={people ?? []} payEvents={(payEvents ?? []) as any} />
    </>
  );
}
