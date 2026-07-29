import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext, householdPeopleOrFilter, visibleDataOrFilter } from "@/lib/auth/household-context";
import { FamilyPlanningClient } from "@/components/lifestyle/FamilyPlanningClient";

type Person = {
  id: string;
  name: string;
  relationship: string | null;
  birth_date?: string | null;
  active_until?: string | null;
};

type CalendarSource = {
  id: string;
  label: string;
  source_type: string;
  source_url: string | null;
  local_authority: string | null;
  school_name: string | null;
  academic_year: string | null;
  notes: string | null;
  last_checked_at: string | null;
};

type CalendarPeriod = {
  id: string;
  child_person_id: string;
  source_id: string | null;
  period_type: string;
  label: string;
  start_date: string;
  end_date: string;
  requires_cover: boolean;
  expected_cost: number;
  notes: string | null;
};

type LeaveAllowance = {
  id: string;
  person_id: string;
  leave_year: number;
  allowance_days: number;
  carried_over_days: number;
  bank_holidays_included: boolean;
  work_pattern: string;
  notes: string | null;
};

type CoverPolicy = {
  id: string;
  child_person_id: string | null;
  label: string;
  policy_type: string;
  requires_adult_cover: boolean;
  applies_weekends: boolean;
  default_cover_type: string;
  notes: string | null;
};

type CoverAssignment = {
  id: string;
  child_person_id: string;
  cover_date: string;
  cover_type: string;
  person_id: string | null;
  uses_leave_days: number;
  cost_estimate: number;
  notes: string | null;
};

function activePeopleFilter(person: Person) {
  if (!person.active_until) return true;
  return new Date(`${person.active_until}T00:00:00`).getTime() >= new Date(new Date().toISOString().slice(0, 10)).getTime();
}

export default async function FamilyPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const peopleFilter = householdPeopleOrFilter(householdContext);
  const dataFilter = visibleDataOrFilter(householdContext);

  const [peopleResult, sourcesResult, periodsResult, leaveResult, policiesResult, assignmentsResult] = await Promise.all([
    supabase
      .from("people")
      .select("id, name, relationship, birth_date, active_until")
      .or(peopleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .order("relationship")
      .order("name")
      .returns<Person[]>(),
    supabase
      .from("family_calendar_sources")
      .select("id, label, source_type, source_url, local_authority, school_name, academic_year, notes, last_checked_at")
      .or(dataFilter)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .returns<CalendarSource[]>(),
    supabase
      .from("family_calendar_periods")
      .select("id, child_person_id, source_id, period_type, label, start_date, end_date, requires_cover, expected_cost, notes")
      .or(dataFilter)
      .order("start_date", { ascending: true })
      .returns<CalendarPeriod[]>(),
    supabase
      .from("family_leave_allowances")
      .select("id, person_id, leave_year, allowance_days, carried_over_days, bank_holidays_included, work_pattern, notes")
      .or(dataFilter)
      .order("leave_year", { ascending: false })
      .returns<LeaveAllowance[]>(),
    supabase
      .from("family_cover_policies")
      .select("id, child_person_id, label, policy_type, requires_adult_cover, applies_weekends, default_cover_type, notes")
      .or(dataFilter)
      .order("created_at", { ascending: false })
      .returns<CoverPolicy[]>(),
    supabase
      .from("family_cover_assignments")
      .select("id, child_person_id, cover_date, cover_type, person_id, uses_leave_days, cost_estimate, notes")
      .or(dataFilter)
      .gte("cover_date", new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10))
      .order("cover_date", { ascending: true })
      .returns<CoverAssignment[]>(),
  ]);

  const people = (peopleResult.data ?? []).filter(activePeopleFilter);
  const children = people.filter((person) => String(person.relationship || "").toLowerCase() === "child");

  return (
    <>
      <Nav />
      <FamilyPlanningClient
        people={people}
        children={children}
        sources={sourcesResult.data ?? []}
        periods={periodsResult.data ?? []}
        leaveAllowances={leaveResult.data ?? []}
        policies={policiesResult.data ?? []}
        assignments={assignmentsResult.data ?? []}
        householdName={householdContext.householdName ?? "Household"}
      />
    </>
  );
}
