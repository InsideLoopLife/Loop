"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { loadHouseholdSavings } from "@/app/mortgage/household-actions";
import { COST_KIND_LABEL, householdCosts, lineName, type CostKind, type HouseholdLine, type PlanLine } from "@/lib/household/essential-costs";
import type { DriveEntry } from "@/lib/vehicles/load-cars";

const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);

const MONTHS_KEY = "loop:household-fund-months";
const DISMISSED_KEY = "loop:household-missing-dismissed";

type ChildAverage = { thisMonth: number; average: number; low: number; high: number; activeMonths: number; schedule: string | null };

const KIND_STYLE: Record<CostKind, string> = {
  fixed: "bg-slate-100 text-slate-600",
  budget: "bg-amber-50 text-amber-700",
  setaside: "bg-sky-50 text-sky-700",
};

function KindTag({ kind }: { kind: CostKind }) {
  return <span className={`ml-1.5 rounded px-1.5 py-px align-middle text-[9px] font-black uppercase tracking-wide ${KIND_STYLE[kind]}`}>{COST_KIND_LABEL[kind]}</span>;
}

/**
 * What the household costs to run — the essential bills grouped (home, cars, children, food,
 * phones, cover, pets) — and the emergency fund that covers them.
 */
export function HouseholdCosts({
  lines,
  mortgageMonthly,
  cars,
  carPaymentLabels,
  onOpenCar,
  children,
  compact = false,
}: {
  lines: PlanLine[];
  mortgageMonthly: number | null;
  cars: DriveEntry[];
  carPaymentLabels: string[];
  onOpenCar?: (slot: number) => void;
  children?: React.ReactNode;
  /** A short summary (no buttons) for the Overview card. */
  compact?: boolean;
}) {
  const [savings, setSavings] = useState<number | null>(null);
  const [petNames, setPetNames] = useState<string[]>([]);
  const [categoryByLabel, setCategoryByLabel] = useState<Record<string, string>>({});
  const [startingSoon, setStartingSoon] = useState<{ label: string; value: number; startDate: string; categoryLabel: string | null }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showLeftOut, setShowLeftOut] = useState(false);
  const [months, setMonths] = useState(3);
  const [childAverages, setChildAverages] = useState<Record<string, ChildAverage>>({});
  const [councilTax, setCouncilTax] = useState<Record<string, { payments: number }>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [showPersonal, setShowPersonal] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    void quietly(() => loadHouseholdSavings()).then((result) => {
      if (!live || isLoopError(result)) return;
      const r = result as { savings: number; petNames: string[]; categoryByLabel: Record<string, string>; startingSoon: { label: string; value: number; startDate: string; categoryLabel: string | null }[]; childAverages?: Record<string, ChildAverage>; councilTax?: Record<string, { payments: number }>; costGroups?: Record<string, string> };
      setGroupOverrides(r.costGroups || {});
      setChildAverages(r.childAverages || {});
      setCouncilTax(r.councilTax || {});
      setStartingSoon(r.startingSoon || []);
      setSavings(r.savings);
      setPetNames(r.petNames);
      setCategoryByLabel(r.categoryByLabel || {});
    });
    try {
      const saved = Number(window.localStorage.getItem(MONTHS_KEY));
      if ([3, 4, 6, 9, 12].includes(saved)) window.setTimeout(() => setMonths(saved), 0);
      const gone = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || "[]");
      if (Array.isArray(gone)) window.setTimeout(() => setDismissed(gone.map(String)), 0);
    } catch {
      /* storage unavailable */
    }
    return () => { live = false; };
  }, []);

  const result = useMemo(
    () =>
      householdCosts({
        // Category budgets and the savings target aren't bills; give each bill its Spending category.
        lines: lines
          .filter((line) => !/spending category$|monthly saving plan/i.test(String(line.helper || "")))
          .map((line) => ({ ...line, categoryLabel: categoryByLabel[lineName(line.label).toLowerCase()] || null }))
          // Bills starting soon, unless the same bill is already running this month.
          .concat(
            startingSoon
              .filter((soon) => !lines.some((line) => lineName(line.label).toLowerCase() === soon.label.toLowerCase()))
              .map((soon) => ({ label: `${soon.label} (from ${new Date(`${soon.startDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`, value: soon.value, categoryLabel: soon.categoryLabel, helper: soon.categoryLabel })),
          ),
        mortgageMonthly,
        cars: cars.map((car) => ({ name: car.label, ownership: car.car.ownership, costs: car.costs })),
        skipLabels: carPaymentLabels,
        petNames,
        childAverages,
        councilTax,
        dismissedMissing: dismissed,
        groupOverrides,
      }),
    [lines, mortgageMonthly, cars, carPaymentLabels, petNames, categoryByLabel, startingSoon, childAverages, councilTax, dismissed, groupOverrides],
  );

  const target = result.fundMonthly * months;
  const covered = savings !== null && result.fundMonthly > 0 ? savings / result.fundMonthly : null;
  const pickMonths = (value: number) => {
    setMonths(value);
    try { window.localStorage.setItem(MONTHS_KEY, String(value)); } catch { /* storage unavailable */ }
  };
  const dismiss = (key: string) => {
    const next = Array.from(new Set([...dismissed, key]));
    setDismissed(next);
    try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  if (compact) {
    return (
      <span className="block">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-bold text-slate-950">Home costs</span>
          <span className="text-xl font-black text-slate-950">{gbp(result.total)}<span className="text-xs font-bold text-slate-500">/mo</span></span>
        </span>
        <span className="mt-1 block text-sm text-slate-500">{gbp(result.fixed)} fixed bills · {gbp(result.budget)} food · {gbp(result.setaside)} to set aside</span>
        <span className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
          {result.groups.map((g, i) => <span key={g.key} className={["bg-emerald-700", "bg-emerald-500", "bg-teal-400", "bg-sky-400", "bg-indigo-300", "bg-violet-300", "bg-slate-300", "bg-slate-200"][i % 8]} style={{ width: `${result.total ? (g.total / result.total) * 100 : 0}%` }} />)}
        </span>
        <span className="mt-3 block text-sm font-semibold text-slate-700">
          Emergency fund ({months} months): <strong>{gbp(target)}</strong>
          {savings !== null ? (covered !== null && covered >= months ? ` · savings cover ${Math.floor(covered)} months ✓` : ` · ${gbp(Math.max(0, target - (savings || 0)))} to go`) : ""}
        </span>
        {result.missing.length ? <span className="mt-1 block text-xs font-semibold text-amber-700">{result.missing.length} usual bill{result.missing.length === 1 ? "" : "s"} not tracked yet</span> : null}
      </span>
    );
  }

  const renderLine = (line: HouseholdLine, key: string, carSlot: number) => (
    <li key={key} className="py-1">
      <div className="flex justify-between gap-3">
        <span className="text-slate-600">
          {carSlot >= 0 && onOpenCar ? <button type="button" onClick={() => onOpenCar(carSlot)} className="font-semibold text-indigo-700 underline-offset-2 hover:underline">{line.name}</button> : line.name}
          {line.parts ? null : <KindTag kind={line.kind} />}
          {line.note ? <span className="block text-[11px] text-slate-400">{line.note}</span> : null}
        </span>
        <span className="font-semibold text-slate-900">{gbp(line.value)}</span>
      </div>
      {line.parts ? (
        <ul className="mt-1 space-y-0.5 border-l-2 border-slate-100 pl-3 text-[13px]">
          {line.parts.map((part, j) => (
            <li key={j} className="flex justify-between gap-3">
              <span className="text-slate-500">
                {part.name}<KindTag kind={part.kind} />
                {part.note ? <span className={`block text-[11px] ${part.estimate ? "text-amber-600" : "text-slate-400"}`}>{part.note}</span> : null}
              </span>
              <span className="font-semibold text-slate-700">{part.value > 0 ? gbp(part.value) : "—"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">What the household costs to run</h2>
          <p className="mt-1 text-sm text-slate-500">The essentials — what you&apos;d still have to pay if money got tight. Streaming, lotteries and savings aren&apos;t counted; fuel and mobile phones are personal, shown below.</p>
        </div>
        <p className="text-right"><span className="block text-2xl font-black text-slate-950">{gbp(result.total)}<span className="text-sm font-bold text-slate-500">/mo</span></span><span className="text-xs font-semibold text-slate-500">{gbp(result.total * 12)} a year</span></p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700"><strong>{gbp(result.fixed)}</strong> fixed bills</span>
        {result.budget > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800"><strong>{gbp(result.budget)}</strong> food budget</span> : null}
        {result.setaside > 0 ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800"><strong>{gbp(result.setaside)}</strong> to set aside for car upkeep</span> : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-3">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {result.groups.map((group) => {
              const isOpen = open === group.key;
              const share = result.total > 0 ? (group.total / result.total) * 100 : 0;
              const split = [group.fixed > 0 && group.setaside > 0 ? `${gbp(group.fixed)} fixed · ${gbp(group.setaside)} set aside` : ""].filter(Boolean).join("");
              return (
                <li key={group.key}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : group.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">{group.label}{split ? <span className="ml-2 text-[11px] font-semibold text-slate-400">{split}</span> : null}</span>
                        <span className="text-sm font-black text-slate-950">{gbp(group.total)}/mo</span>
                      </span>
                      <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <span className="block h-full bg-emerald-600" style={{ width: `${Math.max(2, share) * (group.total ? (group.fixed + group.budget) / group.total : 1)}%` }} />
                        {group.setaside > 0 ? <span className="block h-full bg-sky-400" style={{ width: `${share * (group.setaside / group.total)}%` }} /> : null}
                      </span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {isOpen ? (
                    <ul className="px-3 pb-3 text-sm">
                      {group.lines.map((line, i) => renderLine(line, `${line.name}-${i}`, group.key === "cars" ? cars.findIndex((car) => car.label === line.name) : -1))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {result.missing.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm font-bold text-amber-900">We can&apos;t see these, which most homes have</p>
              <ul className="mt-2 space-y-1.5">
                {result.missing.map((m) => (
                  <li key={m.key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-amber-950">{m.label}{m.why ? <span className="block text-[11px] text-amber-800/80">{m.why}</span> : null}</span>
                    <span className="flex shrink-0 gap-2 text-xs font-bold">
                      {m.key.startsWith("car_insurance:") ? (
                        onOpenCar ? <button type="button" onClick={() => onOpenCar(Math.max(0, cars.findIndex((car) => `car_insurance:${car.label}` === m.key)))} className="text-indigo-700 hover:underline">Add premium</button> : null
                      ) : (
                        <a href={`/spending?add=monthly&prefill_label=${encodeURIComponent(m.label)}`} className="text-indigo-700 hover:underline">Add</a>
                      )}
                      <button type="button" onClick={() => dismiss(m.key)} className="text-slate-500 hover:text-slate-800">Not needed</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.personal.length ? (
            <div className="rounded-xl border border-slate-100">
              <button type="button" onClick={() => setShowPersonal((v) => !v)} aria-expanded={showPersonal} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                <span><span className="text-sm font-bold text-slate-900">Personal costs</span><span className="block text-[11px] text-slate-500">Not in the household total — fuel and phones belong to each person</span></span>
                <span className="flex items-center gap-2 text-sm font-black text-slate-700">{gbp(result.personalFixed + result.personalPlanned)}/mo<ChevronDown className={`h-4 w-4 text-slate-400 transition ${showPersonal ? "rotate-180" : ""}`} aria-hidden /></span>
              </button>
              {showPersonal ? (
                <ul className="space-y-1 px-3 pb-3 text-sm">
                  {result.personal.map((p, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-slate-600">{p.name}<span className={`ml-1.5 rounded px-1.5 py-px align-middle text-[9px] font-black uppercase tracking-wide ${p.kind === "fixed" ? KIND_STYLE.fixed : "bg-violet-50 text-violet-700"}`}>{p.kind === "fixed" ? "Contract" : "Planned"}</span>{p.note ? <span className="block text-[11px] text-slate-400">{p.note}</span> : null}</span>
                      <span className="font-semibold text-slate-900">{gbp(p.value)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">Emergency fund</p>
            <p className="mt-1 text-2xl font-black text-emerald-950">{gbp(target)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-900">
              <span>to cover</span>
              {[3, 6, 9].map((value) => (
                <button key={value} type="button" onClick={() => pickMonths(value)} aria-pressed={months === value} className={`rounded-full px-2.5 py-0.5 font-black ring-1 ${months === value ? "bg-emerald-800 text-white ring-emerald-800" : "bg-white text-emerald-900 ring-emerald-300"}`}>{value} months</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-emerald-900">
              {gbp(result.fundMonthly)} a month: fixed bills {gbp(result.fixed)}{result.budget > 0 ? `, food ${gbp(result.budget)}` : ""}{result.personalFixed > 0 ? `, phone contracts ${gbp(result.personalFixed)}` : ""}.
              {result.setaside > 0 || result.personalPlanned > 0 ? ` Not counted: ${[result.setaside > 0 ? `car upkeep ${gbp(result.setaside)}` : "", result.personalPlanned > 0 ? `fuel ${gbp(result.personalPlanned)}` : ""].filter(Boolean).join(" and ")} — you can pause these.` : ""}
            </p>
            {savings !== null ? (
              <p className="mt-3 text-sm font-semibold text-emerald-950">
                Savings now: <strong>{gbp(savings)}</strong> —{" "}
                {covered !== null && covered >= months ? `covers about ${Math.floor(covered)} months. You're there.` : covered !== null ? `about ${covered.toFixed(1)} months. ${gbp(Math.max(0, target - savings))} to go.` : ""}
              </p>
            ) : (
              <p className="mt-3 text-xs font-semibold text-emerald-900">Checking your savings…</p>
            )}
            <p className="mt-2 text-[11px] font-semibold text-emerald-900/70">Most people aim for 3–6 months. Self-employed or a single income: nearer 6.</p>
          </div>
          {result.setaside > 0 ? (
            <div className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-800">Set aside each month</p>
              <p className="mt-1 text-xl font-black text-sky-950">{gbp(result.setaside)}</p>
              <p className="mt-1 text-xs text-sky-900">Servicing, tyres, brakes and the MOT come round every year or so. Putting this by each month means they&apos;re paid for when they land — worked out from each car&apos;s mileage, size and fuel.</p>
            </div>
          ) : null}
          {children}
        </div>
      </div>

      {result.leftOut.length ? (
        <div className="mt-3">
          <button type="button" onClick={() => setShowLeftOut((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-800">
            {showLeftOut ? "Hide" : "Show"} what&apos;s not counted ({result.leftOut.length})
          </button>
          {showLeftOut ? <p className="mt-1 text-xs text-slate-500">{result.leftOut.map((l) => `${l.name} ${gbp(l.value)}`).join(" · ")}</p> : null}
        </div>
      ) : null}
      <p className="mt-2 text-xs font-semibold text-slate-500">Something in the wrong group? <a href="/spending?groups=1" className="font-bold text-indigo-700 hover:underline">Change groups in Spending →</a></p>
      {cars.length ? <p className="mt-2 text-[11px] text-slate-400">Cars use Loop&apos;s estimates for insurance and upkeep where you haven&apos;t entered your own figures.</p> : null}
    </section>
  );
}
