"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Baby, CalendarDays, CheckCircle2, Clock, Home, Plus, School, ShieldCheck, Sun, Umbrella, Users, XCircle } from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { CalendarPeriodWizard, LeaveAllowanceWizard, CoverAssignmentWizard, CalendarSourceWizard, ImportSchoolCalendarWizard } from "@/components/lifestyle/FamilyPlanningWizards";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import {
  addFamilyCalendarPeriod,
  addFamilyCalendarSource,
  addFamilyCoverAssignment,
  deleteFamilyCalendarPeriod,
  deleteFamilyCoverAssignment,
  saveFamilyCoverPolicy,
  saveFamilyLeaveAllowance,
  importSchoolCalendarSource,
} from "@/app/lifestyle/family-planning/actions";

type Person = { id: string; name: string; relationship: string | null; birth_date?: string | null };
type CalendarSource = { id: string; label: string; source_type: string; source_url: string | null; local_authority: string | null; school_name: string | null; academic_year: string | null; notes: string | null; last_checked_at: string | null };
type CalendarPeriod = { id: string; child_person_id: string; source_id: string | null; period_type: string; label: string; start_date: string; end_date: string; requires_cover: boolean; expected_cost: number; notes: string | null };
type LeaveAllowance = { id: string; person_id: string; leave_year: number; allowance_days: number; carried_over_days: number; bank_holidays_included: boolean; work_pattern: string; notes: string | null };
type CoverPolicy = { id: string; child_person_id: string | null; label: string; policy_type: string; requires_adult_cover: boolean; applies_weekends: boolean; default_cover_type: string; notes: string | null };
type CoverAssignment = { id: string; child_person_id: string; cover_date: string; cover_type: string; person_id: string | null; uses_leave_days: number; cost_estimate: number; notes: string | null };

type Props = {
  people: Person[];
  children: Person[];
  sources: CalendarSource[];
  periods: CalendarPeriod[];
  leaveAllowances: LeaveAllowance[];
  policies: CoverPolicy[];
  assignments: CoverAssignment[];
  householdName: string;
};

type Tab = "overview" | "calendar" | "leave" | "coverage" | "sources";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";

function startOfToday() {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function formatDate(value: string | null | undefined, includeYear = true) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(includeYear ? { year: "numeric" as const } : {}) });
}

function personName(people: Person[], personId: string | null | undefined) {
  if (!personId) return "Household / shared";
  return people.find((person) => person.id === personId)?.name ?? "Person";
}

function periodTone(type: string) {
  if (type === "school_holiday") return "bg-blue-50 text-blue-800 border-blue-100";
  if (type === "nursery_closed") return "bg-orange-50 text-orange-800 border-orange-100";
  if (type === "inset_day") return "bg-amber-50 text-amber-800 border-amber-100";
  if (type === "holiday_club") return "bg-emerald-50 text-emerald-800 border-emerald-100";
  if (type === "bank_holiday") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-purple-50 text-purple-800 border-purple-100";
}

function coverLabel(type: string) {
  const labels: Record<string, string> = {
    parent_leave: "Parent annual leave",
    working_from_home: "Working from home",
    holiday_club: "Holiday club",
    nursery: "Nursery",
    family_cover: "Family cover",
    grandparent: "Grandparent",
    unpaid_leave: "Unpaid leave",
    uncovered: "Uncovered",
    other: "Other cover",
  };
  return labels[type] || type.replaceAll("_", " ");
}

function buildCoverDays(periods: CalendarPeriod[], policies: CoverPolicy[]) {
  const today = startOfToday();
  const horizon = addDays(today, 365);
  const rows: Array<{ key: string; childId: string; date: string; label: string; periodId: string; periodType: string }> = [];

  for (const period of periods) {
    if (!period.requires_cover) continue;
    const periodPolicy = policies.find((policy) => policy.child_person_id === period.child_person_id);
    const includeWeekends = Boolean(periodPolicy?.applies_weekends);
    let pointer = new Date(`${period.start_date}T00:00:00`);
    const end = new Date(`${period.end_date}T00:00:00`);
    while (pointer <= end) {
      if (pointer >= today && pointer <= horizon && (includeWeekends || !isWeekend(pointer))) {
        const date = isoDate(pointer);
        rows.push({
          key: `${period.child_person_id}:${date}`,
          childId: period.child_person_id,
          date,
          label: period.label,
          periodId: period.id,
          periodType: period.period_type,
        });
      }
      pointer = addDays(pointer, 1);
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function leaveUsedByPerson(assignments: CoverAssignment[]) {
  const used = new Map<string, Map<string, number>>();
  for (const assignment of assignments) {
    if (!assignment.person_id || assignment.cover_type !== "parent_leave") continue;
    if (!used.has(assignment.person_id)) used.set(assignment.person_id, new Map());
    const personDates = used.get(assignment.person_id)!;
    personDates.set(assignment.cover_date, Math.max(Number(assignment.uses_leave_days || 0), personDates.get(assignment.cover_date) || 0));
  }
  const result = new Map<string, number>();
  for (const [personId, dates] of used.entries()) {
    result.set(personId, Array.from(dates.values()).reduce((sum, value) => sum + value, 0));
  }
  return result;
}

function ChildOptions({ children }: { children: Person[] }) {
  return <>{children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</>;
}

function AdultOptions({ adults }: { adults: Person[] }) {
  return <>{adults.map((adult) => <option key={adult.id} value={adult.id}>{adult.name}</option>)}</>;
}

function EmptyChildren() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] border border-white/70 bg-white/90 p-8 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">Lifestyle family planner</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Add child profiles first.</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">This planner only appears when your household has child profiles. Add children from Household, then come back to set school holidays and cover planning.</p>
        <Link href="/household" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Open household</Link>
      </section>
    </main>
  );
}

export function FamilyPlanningClient({ people, children, sources, periods, leaveAllowances, policies, assignments, householdName }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const adults = useMemo(() => people.filter((person) => String(person.relationship || "").toLowerCase() !== "child"), [people]);
  const coverDays = useMemo(() => buildCoverDays(periods, policies), [periods, policies]);
  const assignedByKey = useMemo(() => {
    const map = new Map<string, CoverAssignment[]>();
    for (const assignment of assignments) {
      const key = `${assignment.child_person_id}:${assignment.cover_date}`;
      map.set(key, [...(map.get(key) || []), assignment]);
    }
    return map;
  }, [assignments]);
  const uncovered = coverDays.filter((day) => !(assignedByKey.get(day.key) || []).some((assignment) => assignment.cover_type !== "uncovered"));
  const leaveUsed = useMemo(() => leaveUsedByPerson(assignments), [assignments]);
  const currentYear = new Date().getFullYear();
  const yearAllowances = leaveAllowances.filter((allowance) => Number(allowance.leave_year) === currentYear);
  const estimatedCoverCost = assignments.reduce((sum, assignment) => sum + Number(assignment.cost_estimate || 0), 0);

  if (children.length === 0) return <EmptyChildren />;

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2.5rem] border border-white/70 bg-slate-950 text-white shadow-2xl shadow-slate-950/20">
        <div className="grid gap-6 p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Lifestyle · Family planner</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">Plan school holidays before they become work chaos.</h1>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-slate-300">Uses your household children, adult leave allowances, school/nursery dates and cover policies. No AI or paid web search runs by default — dates are manually added, pasted or imported later from saved sources.</p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-black uppercase tracking-wide text-slate-300">
              <span className="rounded-full bg-white/10 px-3 py-2">{householdName}</span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-2 text-emerald-200">{children.length} child profile(s)</span>
              <span className="rounded-full bg-orange-400/15 px-3 py-2 text-orange-200">{uncovered.length} uncovered day(s)</span>
            </div>
          </div>
          <div className="rounded-[2rem] bg-white/10 p-5 ring-1 ring-white/10">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white p-4 text-slate-950"><p className="text-xs font-black uppercase text-slate-500">Cover days</p><p className="mt-2 text-3xl font-black">{coverDays.length}</p><p className="text-xs font-semibold text-slate-500">next 12 months</p></div>
              <div className="rounded-3xl bg-white p-4 text-slate-950"><p className="text-xs font-black uppercase text-slate-500">Uncovered</p><p className="mt-2 text-3xl font-black text-red-600">{uncovered.length}</p><p className="text-xs font-semibold text-slate-500">need a decision</p></div>
              <div className="rounded-3xl bg-white p-4 text-slate-950"><p className="text-xs font-black uppercase text-slate-500">Leave records</p><p className="mt-2 text-3xl font-black">{yearAllowances.length}</p><p className="text-xs font-semibold text-slate-500">for {currentYear}</p></div>
              <div className="rounded-3xl bg-white p-4 text-slate-950"><p className="text-xs font-black uppercase text-slate-500">Cover cost</p><p className="mt-2 text-3xl font-black">{formatMoney(estimatedCoverCost)}</p><p className="text-xs font-semibold text-slate-500">holiday club/family care</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg"><Baby className="h-5 w-5 text-orange-500" /><p className="mt-3 text-xs font-black uppercase text-slate-500">Children</p><p className="text-2xl font-black text-slate-950">{children.map((child) => child.name).join(", ")}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg"><School className="h-5 w-5 text-blue-500" /><p className="mt-3 text-xs font-black uppercase text-slate-500">Calendar periods</p><p className="text-3xl font-black text-slate-950">{periods.length}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg"><Umbrella className="h-5 w-5 text-emerald-500" /><p className="mt-3 text-xs font-black uppercase text-slate-500">Covered days</p><p className="text-3xl font-black text-slate-950">{Math.max(0, coverDays.length - uncovered.length)}</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg"><XCircle className="h-5 w-5 text-red-500" /><p className="mt-3 text-xs font-black uppercase text-slate-500">Gaps</p><p className="text-3xl font-black text-red-600">{uncovered.length}</p></div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-full border border-slate-200 bg-white/80 p-1 shadow-inner">
        {[
          { id: "overview", label: "Overview", icon: Home },
          { id: "calendar", label: "Holiday dates", icon: CalendarDays },
          { id: "leave", label: "Annual leave", icon: Sun },
          { id: "coverage", label: "Cover planner", icon: ShieldCheck },
          { id: "sources", label: "Schools/sources", icon: School },
        ].map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => setTab(item.id as Tab)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" /> {item.label}</button>;
        })}
      </div>

      {tab === "overview" ? (
        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg">
            <h2 className="text-2xl font-black text-slate-950">Upcoming gaps</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Weekday holiday/nursery closure dates that do not yet have cover assigned.</p>
            <div className="mt-5 space-y-3">
              {uncovered.slice(0, 12).map((day) => (
                <div key={day.key} className="flex items-center justify-between gap-4 rounded-3xl bg-red-50 p-4 text-sm font-black text-red-900">
                  <div><p>{formatDate(day.date)} · {personName(children, day.childId)}</p><p className="text-xs font-semibold text-red-700">{day.label}</p></div>
                  <button type="button" onClick={() => setTab("coverage")} className="rounded-full bg-white px-3 py-2 text-xs text-red-700">Add cover</button>
                </div>
              ))}
              {uncovered.length === 0 ? <div className="rounded-3xl bg-emerald-50 p-5 text-sm font-black text-emerald-800">No uncovered weekday child-care days found in the next 12 months.</div> : null}
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg">
            <h2 className="text-2xl font-black text-slate-950">Annual leave balance</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Leave used counts one parent leave day once per person/date, even if covering multiple children.</p>
            <div className="mt-5 space-y-3">
              {yearAllowances.map((allowance) => {
                const allowanceTotal = Number(allowance.allowance_days || 0) + Number(allowance.carried_over_days || 0);
                const used = leaveUsed.get(allowance.person_id) || 0;
                return <div key={allowance.id} className="rounded-3xl bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="font-black text-slate-950">{personName(people, allowance.person_id)}</p><p className="text-sm font-black text-slate-700">{Math.max(0, allowanceTotal - used).toFixed(1)} left</p></div><div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, allowanceTotal ? (used / allowanceTotal) * 100 : 0)}%` }} /></div><p className="mt-2 text-xs font-semibold text-slate-500">{used.toFixed(1)} used of {allowanceTotal.toFixed(1)} · {allowance.work_pattern}</p></div>;
              })}
              {yearAllowances.length === 0 ? <div className="rounded-3xl bg-amber-50 p-5 text-sm font-black text-amber-800">Add annual leave allowances for the adults in this household.</div> : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "calendar" ? (
        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg">
            <h2 className="text-2xl font-black text-slate-950">Add holiday / closure period</h2>
            <CalendarPeriodWizard children={children} sources={sources} />
          </div>
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg">
            <h2 className="text-2xl font-black text-slate-950">Saved periods</h2>
            <div className="mt-5 space-y-3">
              {periods.map((period) => <div key={period.id} className={`rounded-3xl border p-4 ${periodTone(period.period_type)}`}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide">{period.period_type.replaceAll("_", " ")} · {personName(children, period.child_person_id)}</p><h3 className="mt-1 text-lg font-black">{period.label}</h3><p className="text-sm font-semibold">{formatDate(period.start_date)} → {formatDate(period.end_date)} · {period.requires_cover ? "cover required" : "no cover needed"}</p>{period.expected_cost ? <p className="text-xs font-black">Expected cost {formatMoney(period.expected_cost)}</p> : null}</div><form action={deleteFamilyCalendarPeriod}><input type="hidden" name="id" value={period.id} /><button className="rounded-full bg-white px-3 py-2 text-xs font-black text-red-600">Delete</button></form></div></div>)}
              {periods.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 p-6 text-center text-sm font-semibold text-slate-500">Add school holidays, inset days, nursery closure days or holiday club periods.</div> : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "leave" ? (
        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg"><h2 className="text-2xl font-black text-slate-950">Add annual leave allowance</h2><LeaveAllowanceWizard adults={adults} currentYear={currentYear} /></div>
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg"><h2 className="text-2xl font-black text-slate-950">Allowances</h2><div className="mt-5 grid gap-3 md:grid-cols-2">{leaveAllowances.map((allowance) => { const total = Number(allowance.allowance_days || 0) + Number(allowance.carried_over_days || 0); const used = leaveUsed.get(allowance.person_id) || 0; return <article key={allowance.id} className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">{allowance.leave_year}</p><h3 className="text-lg font-black text-slate-950">{personName(people, allowance.person_id)}</h3><p className="text-sm font-semibold text-slate-600">{used.toFixed(1)} used · {Math.max(0, total - used).toFixed(1)} remaining</p><p className="mt-2 text-xs font-semibold text-slate-500">{total.toFixed(1)} total · {allowance.work_pattern}</p></article>; })}{leaveAllowances.length === 0 ? <p className="text-sm font-semibold text-slate-500">No annual leave allowances saved yet.</p> : null}</div></div>
        </section>
      ) : null}

      {tab === "coverage" ? (
        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg"><h2 className="text-2xl font-black text-slate-950">Assign cover</h2><CoverAssignmentWizard children={children} adults={adults} /></div>
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg"><h2 className="text-2xl font-black text-slate-950">Next cover decisions</h2><div className="mt-5 space-y-3">{coverDays.slice(0, 40).map((day) => { const dayAssignments = assignedByKey.get(day.key) || []; const isCovered = dayAssignments.some((assignment) => assignment.cover_type !== "uncovered"); return <div key={day.key} className={`rounded-3xl p-4 ${isCovered ? "bg-emerald-50" : "bg-red-50"}`}><div className="flex items-start justify-between gap-4"><div><p className={`text-xs font-black uppercase ${isCovered ? "text-emerald-700" : "text-red-700"}`}>{formatDate(day.date)} · {personName(children, day.childId)}</p><h3 className="font-black text-slate-950">{day.label}</h3>{dayAssignments.length ? <div className="mt-2 space-y-1">{dayAssignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-700"><span className="rounded-full bg-white px-2 py-1">{coverLabel(assignment.cover_type)}</span><span>{personName(people, assignment.person_id)}</span>{assignment.uses_leave_days ? <span>{Number(assignment.uses_leave_days).toFixed(1)} leave day(s)</span> : null}<form action={deleteFamilyCoverAssignment}><input type="hidden" name="id" value={assignment.id} /><button className="text-red-600">Remove</button></form></div>)}</div> : <p className="text-sm font-semibold text-red-700">No cover assigned yet</p>}</div>{isCovered ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}</div></div>; })}{coverDays.length === 0 ? <p className="rounded-3xl bg-slate-50 p-6 text-sm font-semibold text-slate-500">Add holiday periods first, then LOOP will generate the cover days to allocate.</p> : null}</div></div>
        </section>
      ) : null}

      {tab === "sources" ? (
        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg"><h2 className="text-2xl font-black text-slate-950">Add school/nursery source</h2><CalendarSourceWizard /></div>
          <div className="rounded-[2rem] border border-white/70 bg-white/90 p-6 shadow-lg"><h2 className="text-2xl font-black text-slate-950">Saved sources</h2><div className="mt-5 space-y-3">{sources.map((source) => <article key={source.id} className="rounded-3xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">{source.source_type.replaceAll("_", " ")} · {source.academic_year || "year not set"}</p><h3 className="text-lg font-black text-slate-950">{source.label}</h3><p className="text-sm font-semibold text-slate-600">{source.school_name || source.local_authority || "Manual source"}</p>{source.source_url ? <a href={source.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-black text-orange-600">Open source</a> : null}</article>)}{sources.length === 0 ? <p className="text-sm font-semibold text-slate-500">No sources saved yet. Add school, nursery or local authority references here.</p> : null}</div></div>
          <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5 lg:col-span-2"><div className="flex items-start gap-3"><Clock className="mt-1 h-5 w-5 text-emerald-700" /><div><p className="font-black text-emerald-950">Import school term dates without background AI</p><p className="mt-1 text-sm font-semibold text-emerald-800">Paste a school URL for reference, paste the term-date table text, or upload a text/CSV extract. PDF/photo uploads are staged as source evidence; deterministic parsing runs only on readable text and always creates reviewable periods.</p></div></div><ImportSchoolCalendarWizard children={children} /></div>
        </section>
      ) : null}
    </main>
  );
}
