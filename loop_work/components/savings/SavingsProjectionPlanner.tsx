"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Expand, RotateCcw, Shrink, Users, X } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format/money";

type SavingsProjectionAccount = {
  id: string;
  name: string;
  balance: number;
  annualRate: number;
  monthlyTopUp: number;
};

type ProjectionPerson = {
  id: string;
  name: string;
  birthDate: string | null;
  isDefault?: boolean;
};

type PensionRateScenarios = {
  low: number;
  middle: number;
  high: number;
  defaultKey: "low" | "middle" | "high";
  source: string;
  asOfDate: string | null;
  isFallback: boolean;
  assumptionsUsed: number;
};


type ProjectionSubject = {
  person: ProjectionPerson;
  savingsAccounts: SavingsProjectionAccount[];
  pensionBalance: number;
  monthlyPensionContribution: number;
  pensionAnnualRate: number;
  pensionRateScenarios?: PensionRateScenarios;
  pensionRateSource: string;
  pensionContributionSource: string;
  pensionContributionDetail?: string;
};

type Props = {
  savingsAccounts: SavingsProjectionAccount[];
  pensionBalance: number;
  monthlyPensionContribution: number;
  pensionAnnualRate: number;
  pensionRateScenarios?: PensionRateScenarios;
  pensionRateSource: string;
  pensionContributionSource: string;
  pensionContributionDetail?: string;
  people: ProjectionPerson[];
  asOfDate?: string;
  subjects?: ProjectionSubject[];
};

const horizons = [1, 5, 10, 20, 30];

function effectiveMonthlyRate(annualPercent: number) {
  const annual = Math.max(-0.99, Number(annualPercent || 0) / 100);
  return Math.pow(1 + annual, 1 / 12) - 1;
}

function ageAt(birthDate: string | null, futureDate: Date) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (!Number.isFinite(birth.getTime())) return null;
  let age = futureDate.getFullYear() - birth.getFullYear();
  const beforeBirthday = futureDate.getMonth() < birth.getMonth() || (futureDate.getMonth() === birth.getMonth() && futureDate.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(0, age);
}

function ageLabel(people: ProjectionPerson[], years: number, asOfDate: string) {
  const future = new Date(`${asOfDate}T12:00:00`);
  future.setFullYear(future.getFullYear() + years);
  const rows = people
    .map((person) => ({ name: person.name.split(" ")[0] || person.name, age: ageAt(person.birthDate, future) }))
    .filter((row): row is { name: string; age: number } => row.age != null)
    .slice(0, 3);
  if (rows.length === 0) return null;
  if (rows.length === 1) return `Age ${rows[0].age}`;
  return rows.map((row) => `${row.name} ${row.age}`).join(" · ");
}

function percent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function SavingsProjectionPlanner({
  savingsAccounts: fallbackSavingsAccounts,
  pensionBalance: fallbackPensionBalance,
  monthlyPensionContribution: fallbackMonthlyPensionContribution,
  pensionAnnualRate: fallbackPensionAnnualRate,
  pensionRateScenarios: fallbackPensionRateScenarios,
  pensionRateSource: fallbackPensionRateSource,
  pensionContributionSource: fallbackPensionContributionSource,
  pensionContributionDetail: fallbackPensionContributionDetail,
  people: fallbackPeople,
  asOfDate = new Date().toISOString().slice(0, 10),
  subjects = [],
}: Props) {
  const defaultSubjectIds = subjects.filter((subject) => subject.person.isDefault).map((subject) => subject.person.id);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>(() => defaultSubjectIds.length ? defaultSubjectIds : subjects[0] ? [subjects[0].person.id] : []);
  const [scopeOpen, setScopeOpen] = useState(false);
  const selectedSubjects = subjects.filter((subject) => selectedPersonIds.includes(subject.person.id));
  const savingsAccounts = subjects.length ? selectedSubjects.flatMap((subject) => subject.savingsAccounts) : fallbackSavingsAccounts;
  const pensionBalance = subjects.length ? selectedSubjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.pensionBalance || 0)), 0) : fallbackPensionBalance;
  const monthlyPensionContribution = subjects.length ? selectedSubjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.monthlyPensionContribution || 0)), 0) : fallbackMonthlyPensionContribution;
  const pensionAnnualRate = subjects.length
    ? selectedSubjects.reduce((sum, subject) => sum + Number(subject.pensionAnnualRate || 0) * Math.max(1, Number(subject.pensionBalance || 0)), 0) / Math.max(1, selectedSubjects.reduce((sum, subject) => sum + Math.max(1, Number(subject.pensionBalance || 0)), 0))
    : fallbackPensionAnnualRate;
  const weightedScenario = (key: "low" | "middle" | "high") => selectedSubjects.reduce((sum, subject) => sum + Number(subject.pensionRateScenarios?.[key] ?? subject.pensionAnnualRate ?? 0) * Math.max(1, Number(subject.pensionBalance || 0)), 0) / Math.max(1, selectedSubjects.reduce((sum, subject) => sum + Math.max(1, Number(subject.pensionBalance || 0)), 0));
  const pensionRateScenarios = subjects.length && selectedSubjects.length ? {
    low: weightedScenario("low"), middle: weightedScenario("middle"), high: weightedScenario("high"), defaultKey: "middle" as const,
    source: selectedSubjects.map((subject) => `${subject.person.name}: ${subject.pensionRateSource}`).join(" · "),
    asOfDate: null, isFallback: selectedSubjects.every((subject) => subject.pensionRateScenarios?.isFallback !== false),
    assumptionsUsed: selectedSubjects.reduce((sum, subject) => sum + Number(subject.pensionRateScenarios?.assumptionsUsed || 0), 0),
  } : fallbackPensionRateScenarios;
  const pensionRateSource = subjects.length ? selectedSubjects.map((subject) => `${subject.person.name}: ${subject.pensionRateSource}`).join(" · ") : fallbackPensionRateSource;
  const pensionContributionSource = subjects.length ? selectedSubjects.map((subject) => `${subject.person.name}: ${subject.pensionContributionSource}`).join(" · ") : fallbackPensionContributionSource;
  const pensionContributionDetail = subjects.length ? selectedSubjects.map((subject) => `${subject.person.name}: ${subject.pensionContributionDetail || "No recurring contribution found"}`).join(" | ") : fallbackPensionContributionDetail;
  const people = subjects.length ? selectedSubjects.map((subject) => subject.person) : fallbackPeople;
  const [includeSavings, setIncludeSavings] = useState(true);
  const [includePensions, setIncludePensions] = useState(true);
  const [includeTopUps, setIncludeTopUps] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState(10);
  const [pensionScenario, setPensionScenario] = useState<"low" | "middle" | "high">(pensionRateScenarios?.defaultKey || "middle");
  const [pensionOverride, setPensionOverride] = useState<number | null>(null);
  const [savingsRateOverride, setSavingsRateOverride] = useState<number | null>(null);

  const initialSavings = savingsAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.balance || 0)), 0);
  const monthlySavingsTopUp = savingsAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.monthlyTopUp || 0)), 0);
  const weightedSavingsRate = initialSavings > 0
    ? savingsAccounts.reduce((sum, account) => sum + Math.max(0, Number(account.balance || 0)) * Number(account.annualRate || 0), 0) / initialSavings
    : 0;
  const effectiveSavingsRate = savingsRateOverride ?? weightedSavingsRate;
  const scenarioRate = pensionRateScenarios ? pensionRateScenarios[pensionScenario] : pensionAnnualRate;
  const effectivePensionRate = pensionOverride ?? scenarioRate;

  const projection = useMemo(() => {
    const savings = savingsAccounts.map((account) => ({
      ...account,
      balance: Math.max(0, Number(account.balance || 0)),
      monthlyRate: effectiveMonthlyRate(savingsRateOverride ?? Number(account.annualRate || 0)),
    }));
    let pension = Math.max(0, Number(pensionBalance || 0));
    const pensionMonthlyRate = effectiveMonthlyRate(effectivePensionRate);
    let savingsContributions = 0;
    let pensionContributions = 0;
    const points: Array<{
      year: number;
      label: string;
      savings: number;
      pensions: number;
      total: number;
      starting: number;
      contributions: number;
      growth: number;
      savingsContributions: number;
      pensionContributions: number;
      savingsGrowth: number;
      pensionGrowth: number;
    }> = [];

    const starting = (includeSavings ? initialSavings : 0) + (includePensions ? pension : 0);
    points.push({
      year: 0,
      label: "Today",
      savings: includeSavings ? initialSavings : 0,
      pensions: includePensions ? pension : 0,
      total: starting,
      starting,
      contributions: 0,
      growth: 0,
      savingsContributions: 0,
      pensionContributions: 0,
      savingsGrowth: 0,
      pensionGrowth: 0,
    });

    for (let month = 1; month <= 30 * 12; month += 1) {
      if (includeSavings) {
        for (const account of savings) {
          const contribution = includeTopUps ? Math.max(0, Number(account.monthlyTopUp || 0)) : 0;
          // Contributions are treated as arriving at the start of the month. January therefore
          // receives 12 months of growth while December receives one month.
          account.balance = (account.balance + contribution) * (1 + account.monthlyRate);
          savingsContributions += contribution;
        }
      }
      if (includePensions) {
        const contribution = includeTopUps ? Math.max(0, Number(monthlyPensionContribution || 0)) : 0;
        pension = (pension + contribution) * (1 + pensionMonthlyRate);
        pensionContributions += contribution;
      }

      if (month % 12 === 0) {
        const year = month / 12;
        const savingsValue = includeSavings ? savings.reduce((sum, account) => sum + account.balance, 0) : 0;
        const pensionValue = includePensions ? pension : 0;
        const total = savingsValue + pensionValue;
        const contributions = savingsContributions + pensionContributions;
        const savingsStarting = includeSavings ? initialSavings : 0;
        const pensionStarting = includePensions ? Math.max(0, Number(pensionBalance || 0)) : 0;
        const savingsGrowth = Math.max(0, savingsValue - savingsStarting - savingsContributions);
        const pensionGrowth = Math.max(0, pensionValue - pensionStarting - pensionContributions);
        points.push({
          year,
          label: `${year}y`,
          savings: savingsValue,
          pensions: pensionValue,
          total,
          starting,
          contributions,
          growth: Math.max(0, total - starting - contributions),
          savingsContributions,
          pensionContributions,
          savingsGrowth,
          pensionGrowth,
        });
      }
    }
    return points;
  }, [effectivePensionRate, includePensions, includeSavings, includeTopUps, initialSavings, monthlyPensionContribution, pensionBalance, savingsAccounts, savingsRateOverride]);

  const rows = horizons.map((years) => projection.find((point) => point.year === years) || projection[projection.length - 1]);
  const selected = projection.find((point) => point.year === selectedHorizon) || rows[2];
  const pieData = [
    { name: "Starting pot", value: selected.starting, colour: "#334155" },
    { name: "Savings contributions", value: selected.savingsContributions, colour: "#86efac" },
    { name: "Pension contributions", value: selected.pensionContributions, colour: "#60a5fa" },
    { name: "Savings growth", value: selected.savingsGrowth, colour: "#fb923c" },
    { name: "Pension growth", value: selected.pensionGrowth, colour: "#2dd4bf" },
  ].filter((row) => row.value > 0.005);

  const scopeLabel = people.length === 1 ? people[0].name : `${people.length} people selected`;
  return (
    <div className="space-y-5">
      {subjects.length ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => setScopeOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm">
            <Users className="h-4 w-4" /> Projection scope: {scopeLabel}
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700 shadow-sm">
          <input type="checkbox" className="mr-2" checked={includeSavings} onChange={(event) => setIncludeSavings(event.target.checked)} />
          Include savings
          <span className="mt-1 block text-xs font-bold text-slate-400">{formatMoney(initialSavings)} at the rates on each account</span>
        </label>
        <label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700 shadow-sm">
          <input type="checkbox" className="mr-2" checked={includePensions} onChange={(event) => setIncludePensions(event.target.checked)} />
          Include pensions
          <span className="mt-1 block text-xs font-bold text-slate-400">{formatMoney(pensionBalance)} at {percent(effectivePensionRate)}</span>
        </label>
        <label className="rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700 shadow-sm">
          <input type="checkbox" className="mr-2" checked={includeTopUps} onChange={(event) => setIncludeTopUps(event.target.checked)} />
          Include scheduled contributions
          <span className="mt-1 block text-xs font-bold text-slate-400">{formatMoney(monthlySavingsTopUp + monthlyPensionContribution)}/month</span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Savings rate used</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{percent(effectiveSavingsRate)}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Weighted from the live rate on {savingsAccounts.length} tracked account{savingsAccounts.length === 1 ? "" : "s"}.</p>
        </div>
        <div className="rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">Pension growth used</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{percent(effectivePensionRate)}</p>
            </div>
            {pensionRateScenarios ? <div className="flex rounded-full bg-white p-1 ring-1 ring-blue-100">{(["low", "middle", "high"] as const).map((key) => <button key={key} type="button" onClick={() => setPensionScenario(key)} className={`rounded-full px-3 py-1 text-[10px] font-black capitalize ${pensionScenario === key ? "bg-blue-600 text-white" : "text-blue-700"}`}>{key}</button>)}</div> : null}
          </div>
          <p className="mt-2 text-xs font-bold text-slate-500">{pensionRateScenarios?.source || pensionRateSource}</p>
          {pensionRateScenarios?.asOfDate ? <p className="mt-1 text-[11px] font-black text-blue-700/70">Performance checked {pensionRateScenarios.asOfDate} · refreshed annually</p> : null}
        </div>
        <div className="rounded-3xl bg-orange-50 p-4 ring-1 ring-orange-100">
          <p className="text-xs font-black uppercase tracking-wide text-orange-700">Pension contribution used</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(monthlyPensionContribution)}/mo</p>
          {pensionContributionDetail ? <p className="mt-1 text-xs font-black text-orange-800">{pensionContributionDetail}</p> : null}
          <p className="mt-1 text-xs font-bold text-slate-500">{pensionContributionSource}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
          <button
            type="button"
            key={row.year}
            onClick={() => setSelectedHorizon(row.year)}
            className={`rounded-[2rem] border p-5 text-left shadow-sm transition ${selectedHorizon === row.year ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950 hover:border-slate-400"}`}
          >
            <p className={`text-xs font-black uppercase tracking-[0.16em] ${selectedHorizon === row.year ? "text-white/60" : "text-slate-400"}`}>
              {row.year} year{row.year === 1 ? "" : "s"}{ageLabel(people, row.year, asOfDate) ? ` (${ageLabel(people, row.year, asOfDate)})` : ""}
            </p>
            <p className="mt-2 text-2xl font-black">{formatMoney(row.total)}</p>
            <div className={`mt-3 space-y-1 text-xs font-bold ${selectedHorizon === row.year ? "text-white/65" : "text-slate-500"}`}>
              <p>Savings: {formatMoney(row.savings)}</p>
              <p>Pensions: {formatMoney(row.pensions)}</p>
              <p>Growth: {formatMoney(row.growth)}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_0.7fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Growth over time</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Savings and pension projection</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">Every contribution is grown only for the months it is actually in the pot.</p>
            </div>
            <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">
              {expanded ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}{expanded ? "Collapse graph" : "Expand graph"}
            </button>
          </div>
          <div className={expanded ? "mt-5 h-[34rem]" : "mt-5 h-80"}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projection} margin={{ top: 10, right: 12, bottom: 4, left: 6 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval={expanded ? 1 : 4} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `£${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 11 }} width={64} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} labelFormatter={(label) => label === "Today" ? "Today" : `In ${label}`} />
                <Legend />
                <Line type="monotone" dataKey="total" name="Combined" stroke="#0f172a" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="savings" name="Savings" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="pensions" name="Pensions" stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">What makes up the result</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">At {selectedHorizon} year{selectedHorizon === 1 ? "" : "s"}</h3>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="82%" paddingAngle={2}>
                  {pieData.map((entry) => <Cell key={entry.name} fill={entry.colour} />)}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2 text-sm font-bold text-slate-600">
            {pieData.map((row) => (
              <div key={row.name} className="flex justify-between gap-3"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.colour }} />{row.name}</span><span className="text-slate-950">{formatMoney(row.value)}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-50">
        <button type="button" onClick={() => setShowAssumptions((value) => !value)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-black text-slate-700">
          <span>Advanced assumptions — automatic by default</span>
          {showAssumptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showAssumptions ? (
          <div className="grid gap-3 border-t border-slate-200 p-5 md:grid-cols-2">
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Override all savings growth %
              <input type="number" step="0.1" value={savingsRateOverride ?? ""} placeholder={weightedSavingsRate.toFixed(2)} onChange={(event) => setSavingsRateOverride(event.target.value === "" ? null : Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950" />
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Override pension growth %
              <input type="number" step="0.1" value={pensionOverride ?? ""} placeholder={pensionAnnualRate.toFixed(2)} onChange={(event) => setPensionOverride(event.target.value === "" ? null : Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-950" />
            </label>
            <button type="button" onClick={() => { setSavingsRateOverride(null); setPensionOverride(null); setPensionScenario(pensionRateScenarios?.defaultKey || "middle"); }} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 md:col-span-2">
              <RotateCcw className="h-4 w-4" /> Reset to automatic rates
            </button>
          </div>
        ) : null}
      </div>

      <p className="rounded-3xl bg-slate-50 p-4 text-xs font-bold text-slate-500">
        This is a projection from current balances, current saver rates, stored 5-year/10-year pension performance evidence or recorded pension history, and scheduled contributions. It is not a guaranteed return. Fees, tax, rate changes, withdrawals and missing history can change the outcome.
      </p>
      {scopeOpen ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Choose projection people">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Projection scope</p><h3 className="mt-1 text-2xl font-black text-slate-950">Who should be included?</h3><p className="mt-1 text-sm font-bold text-slate-500">The default is your own data. Select more people only when you deliberately want a combined projection.</p></div>
              <button type="button" onClick={() => setScopeOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 space-y-2">
              {subjects.map((subject) => {
                const checked = selectedPersonIds.includes(subject.person.id);
                return <label key={subject.person.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${checked ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <input type="checkbox" checked={checked} onChange={() => setSelectedPersonIds((current) => checked ? (current.length > 1 ? current.filter((id) => id !== subject.person.id) : current) : [...current, subject.person.id])} className="mt-1" />
                  <span className="min-w-0"><span className="block font-black text-slate-950">{subject.person.name}{subject.person.isDefault ? " (you)" : ""}</span><span className="mt-1 block text-xs font-bold text-slate-500">Savings {formatMoney(subject.savingsAccounts.reduce((sum, account) => sum + account.balance, 0))} · Pension {formatMoney(subject.pensionBalance)} · Contributions {formatMoney(subject.monthlyPensionContribution)}/mo</span><span className="mt-1 block text-xs font-semibold text-slate-400">{subject.pensionContributionDetail || "No recurring pension contribution found"}</span></span>
                </label>;
              })}
            </div>
            <div className="mt-5 flex justify-end"><button type="button" onClick={() => setScopeOpen(false)} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Use selected people</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
