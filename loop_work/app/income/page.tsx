import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { createClient } from "@/lib/supabase/server";
import { IncomeTrackerClient } from "@/components/income/IncomeTrackerClient";
import {
  getActiveHouseholdContext,
  householdMemberDataOrFilter,
  householdPeopleOrFilter,
} from "@/lib/auth/household-context";

type IncomeEntry = {
  id: string;
  user_id?: string | null;
  owner_user_id?: string | null;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};

type Person = {
  id: string;
  user_id?: string | null;
  name: string;
  relationship: string;
  birth_date?: string | null;
  avatar_url?: string | null;
  linked_user_id?: string | null;
  email?: string | null;
  account_status?: string | null;
  active_until?: string | null;
};
type StudentLoanAccount = {
  id: string;
  user_id?: string | null;
  owner_user_id?: string | null;
  person_id: string | null;
  plan: string;
  current_balance: number;
  balance_date: string;
  interest_rate: number | null;
  payroll_monthly_override: number | null;
  notes: string | null;
};
type StudentLoanBalanceEvent = {
  id: string;
  student_loan_account_id: string;
  event_type: string;
  amount: number | null;
  balance_after: number;
  effective_at: string;
  note: string | null;
  created_at: string;
};
type IncomeDeduction = {
  id: string;
  person_id: string | null;
  deduction_type: "car_salary_sacrifice" | "cycle_to_work" | "additional_pension" | "other";
  label: string;
  monthly_amount: number;
  notes: string | null;
  effective_from: string;
  effective_until: string | null;
};
type PayEvent = {
  id: string;
  user_id?: string | null;
  owner_user_id?: string | null;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: string | null;
  employer_pension_percent?: number | null;
  employer_pension_monthly_amount?: number | null;
  employer_ni_topup_enabled?: boolean | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_topup_share_percent?: number | null;
  student_loan_plan: string;
  effective_from: string;
  effective_until: string | null;
  pay_timing?: string | null;
  pay_day_of_month?: number | string | null;
  pay_adjustment?: string | null;
  maternity_scheme?: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: string | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
};

function normaliseIdentity(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function incomePersonIdentityKey(person: Person) {
  if (person.linked_user_id) return `linked:${person.linked_user_id}`;
  if (person.email) return `email:${normaliseIdentity(person.email)}`;
  if (person.user_id && person.relationship === "self")
    return `user:${person.user_id}`;
  return `person:${normaliseIdentity(person.name)}:${person.relationship}:${person.birth_date || ""}`;
}

function canonicaliseIncomePeople(rows: Person[], preferredUserId: string) {
  const canonicalByKey = new Map<string, Person>();
  const rank = (person: Person) => {
    let value = 100;
    if (person.account_status === "duplicate_merged" || person.active_until)
      value += 1000;
    if (person.user_id === preferredUserId) value -= 30;
    if (person.linked_user_id) value -= 20;
    if (person.relationship === "self") value -= 10;
    if (person.email) value -= 2;
    return value;
  };
  for (const person of rows) {
    if (person.account_status === "duplicate_merged" || person.active_until)
      continue;
    const key = incomePersonIdentityKey(person);
    const existing = canonicalByKey.get(key);
    if (!existing || rank(person) < rank(existing))
      canonicalByKey.set(key, person);
  }
  const canonicalPeople = Array.from(canonicalByKey.values());
  const rawToCanonicalId = new Map<string, string>();
  for (const person of rows) {
    const canonical = canonicalByKey.get(incomePersonIdentityKey(person));
    if (canonical) rawToCanonicalId.set(person.id, canonical.id);
  }
  return { canonicalPeople, rawToCanonicalId };
}

export default async function IncomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);
  const householdPeopleFilter = householdPeopleOrFilter(householdContext);

  const [
    { data: entries },
    { data: people },
    payEventsResult,
    { data: studentLoanAccounts },
    { data: studentLoanBalanceEvents },
    { data: incomeDeductions },
  ] = await Promise.all([
    supabase
      .from("income_entries")
      .select(
        "id, user_id, owner_user_id, person_id, label, gross_amount, net_amount, frequency, entry_date",
      )
      .or(householdVisibleFilter)
      .order("entry_date", { ascending: false })
      .returns<IncomeEntry[]>(),
    supabase
      .from("people")
      .select(
        "id, user_id, name, relationship, birth_date, avatar_url, linked_user_id, email, account_status, active_until",
      )
      .or(householdPeopleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .order("relationship")
      .returns<Person[]>(),
    supabase
      .from("pay_events")
      .select(
        "id, user_id, owner_user_id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, employer_pension_percent, employer_pension_monthly_amount, employer_ni_topup_enabled, employer_ni_rate_percent, employer_ni_topup_share_percent, student_loan_plan, effective_from, effective_until, pay_timing, pay_day_of_month, pay_adjustment, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate",
      )
      .or(householdVisibleFilter)
      .order("effective_from", { ascending: false })
      .returns<PayEvent[]>(),
    supabase
      .from("student_loan_accounts")
      .select(
        "id, user_id, owner_user_id, person_id, plan, current_balance, balance_date, interest_rate, payroll_monthly_override, notes",
      )
      .or(householdVisibleFilter)
      .order("balance_date", { ascending: false })
      .returns<StudentLoanAccount[]>(),
    supabase
      .from("student_loan_balance_events")
      .select("id, student_loan_account_id, event_type, amount, balance_after, effective_at, note, created_at")
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false })
      .returns<StudentLoanBalanceEvent[]>(),
    supabase
      .from("income_deductions")
      .select("id, person_id, deduction_type, label, monthly_amount, notes, effective_from, effective_until")
      .or(householdVisibleFilter)
      .order("created_at", { ascending: false })
      .returns<IncomeDeduction[]>(),
  ]);

  let payEvents = (payEventsResult.data || []) as PayEvent[];
  let payEventsSchemaWarning: string | null = null;
  if (payEventsResult.error) {
    payEventsSchemaWarning = payEventsResult.error.message;
    const fallback = await supabase
      .from("pay_events")
      .select("id, user_id, owner_user_id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate")
      .or(householdVisibleFilter)
      .order("effective_from", { ascending: false })
      .returns<PayEvent[]>();
    payEvents = fallback.data || [];
    if (fallback.error) payEventsSchemaWarning = `${payEventsSchemaWarning}; fallback: ${fallback.error.message}`;
  }

  const rawPeople = (people ?? []) as Person[];
  const { canonicalPeople, rawToCanonicalId } = canonicaliseIncomePeople(
    rawPeople,
    householdContext.dataOwnerUserId,
  );
  const canonicalisePersonId = (personId: string | null | undefined) =>
    personId ? rawToCanonicalId.get(personId) || personId : null;
  const canonicalEntries = (entries ?? []).map((entry) => ({
    ...entry,
    person_id: canonicalisePersonId(entry.person_id),
  }));
  const canonicalPayEvents = (payEvents ?? []).map((event) => ({
    ...event,
    person_id: canonicalisePersonId(event.person_id),
  }));
  const canonicalStudentLoans = (studentLoanAccounts ?? []).map((account) => ({
    ...account,
    person_id: canonicalisePersonId(account.person_id),
  }));
  const canonicalDeductions = (incomeDeductions ?? []).map((deduction) => ({
    ...deduction,
    person_id: canonicalisePersonId(deduction.person_id),
  }));
  const signedInEmail = normaliseIdentity(user.email);
  const signedInPerson =
    canonicalPeople.find((person) => person.linked_user_id === user.id) ||
    (signedInEmail
      ? canonicalPeople.find(
          (person) => normaliseIdentity(person.email) === signedInEmail,
        ) || null
      : null) ||
    (user.id === householdContext.dataOwnerUserId
      ? canonicalPeople.find(
          (person) =>
            person.relationship === "self" &&
            person.user_id === householdContext.dataOwnerUserId,
        ) || null
      : null);

  return (
    <>
      <Nav />
      {canonicalEntries.length +
        canonicalPayEvents.length +
        canonicalStudentLoans.length ===
      0 ? (
        <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8">
          <PageLandingExperience kind="income" />
        </main>
      ) : null}
      <IncomeTrackerClient
        entries={canonicalEntries}
        people={canonicalPeople}
        payEvents={canonicalPayEvents as any}
        studentLoanAccounts={canonicalStudentLoans as any}
        studentLoanBalanceEvents={studentLoanBalanceEvents ?? []}
        incomeDeductions={canonicalDeductions as any}
        hasHousehold={Boolean(householdContext.householdId)}
        signedInPersonId={signedInPerson?.id || null}
        canViewHouseholdIncome={householdContext.canViewHouseholdIncome}
        schemaWarning={payEventsSchemaWarning}
      />
    </>
  );
}
