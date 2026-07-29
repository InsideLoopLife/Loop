"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
import { addIncomeEntry, deleteIncomeEntry } from "@/app/income/actions";

type Person = { id: string; name: string; relationship: string };
type IncomeEntry = { id: string; person_id: string | null; label: string; gross_amount: number; net_amount: number | null; frequency: "monthly" | "annual" | "weekly"; entry_date: string };
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
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: MaternityPayMode | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
};

type Props = { entries: IncomeEntry[]; people: Person[]; payEvents: PayEvent[] };

type IncomeLine = {
  id: string;
  source: "manual" | "pay_event";
  person_id: string | null;
  label: string;
  monthlyGross: number;
  monthlyNet: number;
  frequencyLabel: string;
  dateLabel: string;
  kind: string;
  manageHref?: string;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex, 0).toISOString().slice(0, 10);
}

function isActiveInMonth(start: string, end: string | null, month: string) {
  return start <= monthEnd(month) && (!end || end >= monthStart(month));
}

function monthlyEquivalent(entry: IncomeEntry, amountKey: "gross_amount" | "net_amount") {
  const amount = Number(entry[amountKey] ?? 0);
  if (entry.frequency === "annual") return amount / 12;
  if (entry.frequency === "weekly") return (amount * 52) / 12;
  return amount;
}

function getPayEventNet(event: PayEvent, month: string) {
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

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 focus:ring-2";

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-3xl rounded-t-[2rem] border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Manual income</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Add income</h2>
            <p className="mt-1 text-sm text-slate-500">Use this for dividends, bonuses or side income. Salaries/maternity should be managed in Household.</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function personName(peopleById: Map<string, Person>, personId: string | null) {
  return personId ? peopleById.get(personId)?.name ?? "Unknown" : "Household";
}

function lineAccent(line: IncomeLine) {
  if (line.kind === "maternity") return "from-pink-500 to-orange-400";
  if (line.source === "pay_event") return "from-emerald-500 to-teal-400";
  return "from-slate-950 to-slate-600";
}

function incomeStatus(event: PayEvent, month: string) {
  if (event.effective_from > monthEnd(month)) return "future";
  if (event.effective_until && event.effective_until < monthStart(month)) return "archived";
  return "active";
}

export function IncomeTrackerClient({ entries, people, payEvents }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [personFilter, setPersonFilter] = useState("all");
  const [month, setMonth] = useState(currentMonth());
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const lines = useMemo<IncomeLine[]>(() => {
    const manualLines: IncomeLine[] = entries.map((entry) => ({
      id: entry.id,
      source: "manual",
      person_id: entry.person_id,
      label: entry.label,
      monthlyGross: monthlyEquivalent(entry, "gross_amount"),
      monthlyNet: monthlyEquivalent(entry, "net_amount"),
      frequencyLabel: entry.frequency,
      dateLabel: entry.entry_date,
      kind: "manual",
    }));

    const payLines: IncomeLine[] = payEvents
      .filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month))
      .map((event) => ({
        id: event.id,
        source: "pay_event",
        person_id: event.person_id,
        label: event.label,
        monthlyGross: Number(event.gross_annual_salary ?? 0) / 12,
        monthlyNet: getPayEventNet(event, month),
        frequencyLabel: event.pay_kind ?? "salary",
        dateLabel: `${event.effective_from} → ${event.effective_until ?? "ongoing"}`,
        kind: event.pay_kind ?? "salary",
        manageHref: event.person_id ? `/household/${event.person_id}` : undefined,
      }));

    return [...payLines, ...manualLines];
  }, [entries, payEvents, month]);

  const filtered = personFilter === "all" ? lines : lines.filter((line) => line.person_id === personFilter);
  const monthlyGross = filtered.reduce((sum, line) => sum + Number(line.monthlyGross ?? 0), 0);
  const monthlyNet = filtered.reduce((sum, line) => sum + Number(line.monthlyNet ?? 0), 0);
  const takeHomeRate = monthlyGross > 0 ? (monthlyNet / monthlyGross) * 100 : 0;
  const upcomingChanges = payEvents
    .filter((event) => event.effective_from > monthEnd(month) || (event.effective_until && event.effective_until > monthEnd(month)))
    .sort((a, b) => (a.effective_from || "").localeCompare(b.effective_from || ""))
    .slice(0, 5);

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_36px_110px_-64px_rgba(15,23,42,.9)] md:p-8">
        <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">Income command centre</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{formatMoney(monthlyNet)}</h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-300">Estimated take-home for {monthLabel(month)} from active Household pay events, maternity records and manual income.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:w-[560px]">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Gross</p><p className="mt-1 text-2xl font-black">{formatMoney(monthlyGross)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Take-home rate</p><p className="mt-1 text-2xl font-black">{takeHomeRate.toFixed(0)}%</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Lines</p><p className="mt-1 text-2xl font-black">{filtered.length}</p></div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input value={month} onChange={(event) => setMonth(event.target.value)} type="month" className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-bold text-slate-700 outline-none ring-orange-500 focus:ring-2" />
          <button onClick={() => setPersonFilter("all")} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === "all" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>All</button>
          {people.map((person) => (
            <button key={person.id} onClick={() => setPersonFilter(person.id)} className={`rounded-full px-4 py-2 text-sm font-black ${personFilter === person.id ? "bg-slate-950 text-white" : person.relationship === "child" ? "border border-sky-100 bg-sky-50 text-sky-800" : "border border-orange-100 bg-orange-50 text-orange-800"}`}>{person.name}</button>
          ))}
        </div>
        <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800"><span className="text-lg leading-none">+</span> Add manual income</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <SectionCard title="Current income lines" description="These are the active income items for the selected month. Household salaries and maternity should be edited from the person profile.">
          <div className="grid gap-3">
            {filtered.map((line) => (
              <div key={`${line.source}-${line.id}`} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className={`h-1.5 bg-gradient-to-r ${lineAccent(line)}`} />
                <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{personName(peopleById, line.person_id)}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-black ${line.source === "pay_event" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{line.source === "pay_event" ? "From Household" : "Manual"}</span>
                    </div>
                    <p className="mt-3 text-lg font-black text-slate-950">{line.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{line.frequencyLabel.replaceAll("_", " ")} · {line.dateLabel}</p>
                  </div>
                  <div className="flex items-center gap-4 md:justify-end">
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Net / month</p>
                      <p className="text-2xl font-black text-slate-950">{formatMoney(line.monthlyNet)}</p>
                      <p className="text-xs text-slate-500">Gross {formatMoney(line.monthlyGross)}</p>
                    </div>
                    {line.manageHref ? <Link href={line.manageHref} className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white">Manage</Link> : null}
                    {line.source === "manual" ? (
                      <form action={deleteIncomeEntry}><input type="hidden" name="id" value={line.id} /><button className="text-sm font-bold text-red-600">Delete</button></form>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 ? <p className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500">No income for this person/month yet. Add pay events in Household or manual extras here.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Upcoming changes" description="Useful for maternity switches, return-to-work dates and salary changes.">
          <div className="space-y-3">
            {upcomingChanges.map((event) => (
              <Link key={event.id} href={event.person_id ? `/household/${event.person_id}` : "/household"} className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{personName(peopleById, event.person_id)}</p>
                <p className="mt-1 font-black text-slate-950">{event.label}</p>
                <p className="mt-1 text-sm text-slate-500">{event.effective_from} → {event.effective_until ?? "ongoing"}</p>
              </Link>
            ))}
            {upcomingChanges.length === 0 ? <p className="text-sm text-slate-500">No future-dated income changes found yet.</p> : null}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Income archive by person" description="A full log of salary, maternity and return-to-work changes. This keeps historic income movement visible without cluttering the current month.">
        <div className="grid gap-3 md:grid-cols-2">
          {payEvents
            .filter((event) => personFilter === "all" || event.person_id === personFilter)
            .sort((a, b) => (b.effective_from || "").localeCompare(a.effective_from || ""))
            .map((event) => {
              const status = incomeStatus(event, month);
              return (
                <Link key={event.id} href={event.person_id ? `/household/${event.person_id}` : "/household"} className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{personName(peopleById, event.person_id)} · {event.pay_kind?.replaceAll("_", " ") || "salary"}</p>
                      <p className="mt-1 text-lg font-black text-slate-950">{event.label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{event.effective_from} → {event.effective_until ?? "ongoing"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${status === "active" ? "bg-emerald-100 text-emerald-800" : status === "future" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{status}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Gross annual</p><p className="font-black text-slate-950">{formatMoney(Number(event.gross_annual_salary || 0))}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Est. net now</p><p className="font-black text-slate-950">{formatMoney(getPayEventNet(event, month))}</p></div>
                  </div>
                </Link>
              );
            })}
          {payEvents.filter((event) => personFilter === "all" || event.person_id === personFilter).length === 0 ? <p className="text-sm font-semibold text-slate-500">No Household pay records yet.</p> : null}
        </div>
      </SectionCard>

      {modalOpen ? (
        <Modal onClose={() => setModalOpen(false)}>
          <form action={addIncomeEntry} className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="text-sm font-medium text-slate-700">Person</span><select name="person_id" className={inputClass}><option value="">Household / shared</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <FormInput label="Label" name="label" placeholder="Dividends, bonus, side income" required />
            <FormInput label="Gross amount" name="gross_amount" type="number" step="0.01" required />
            <FormInput label="Net amount" name="net_amount" type="number" step="0.01" />
            <label className="block"><span className="text-sm font-medium text-slate-700">Frequency</span><select name="frequency" className={inputClass}><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="weekly">Weekly</option></select></label>
            <FormInput label="Date" name="entry_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            <div className="flex items-end"><SubmitButton>Add income</SubmitButton></div>
          </form>
        </Modal>
      ) : null}
    </main>
  );
}
