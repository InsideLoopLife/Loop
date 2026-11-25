"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { loadHouseholdSavings } from "@/app/mortgage/household-actions";
import { householdCosts, lineName, type PlanLine } from "@/lib/household/essential-costs";
import type { DriveEntry } from "@/lib/vehicles/load-cars";

const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);

const MONTHS_KEY = "loop:household-fund-months";

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

  useEffect(() => {
    let live = true;
    void quietly(() => loadHouseholdSavings()).then((result) => {
      if (!live || isLoopError(result)) return;
      const r = result as { savings: number; petNames: string[]; categoryByLabel: Record<string, string>; startingSoon: { label: string; value: number; startDate: string; categoryLabel: string | null }[] };
      setStartingSoon(r.startingSoon || []);
      setSavings(r.savings);
      setPetNames(r.petNames);
      setCategoryByLabel(r.categoryByLabel || {});
    });
    try {
      const saved = Number(window.localStorage.getItem(MONTHS_KEY));
      if ([3, 4, 6, 9, 12].includes(saved)) window.setTimeout(() => setMonths(saved), 0);
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
        cars: cars.map((car) => ({ name: car.label, monthly: car.monthly, note: "payment + fuel, insurance, servicing & tax" })),
        skipLabels: carPaymentLabels,
        petNames,
      }),
    [lines, mortgageMonthly, cars, carPaymentLabels, petNames, categoryByLabel, startingSoon],
  );

  const target = result.total * months;
  const covered = savings !== null && result.total > 0 ? savings / result.total : null;
  const pickMonths = (value: number) => {
    setMonths(value);
    try { window.localStorage.setItem(MONTHS_KEY, String(value)); } catch { /* storage unavailable */ }
  };

  if (compact) {
    return (
      <span className="block">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-bold text-slate-950">Home costs</span>
          <span className="text-xl font-black text-slate-950">{gbp(result.total)}<span className="text-xs font-bold text-slate-500">/mo</span></span>
        </span>
        <span className="mt-1 block text-sm text-slate-500">The essentials to run the household — {result.groups.map((g) => g.label.toLowerCase()).slice(0, 4).join(", ")}{result.groups.length > 4 ? "…" : ""}</span>
        <span className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100">
          {result.groups.map((g, i) => <span key={g.key} className={["bg-emerald-700", "bg-emerald-500", "bg-teal-400", "bg-sky-400", "bg-indigo-300", "bg-violet-300", "bg-slate-300", "bg-slate-200"][i % 8]} style={{ width: `${result.total ? (g.total / result.total) * 100 : 0}%` }} />)}
        </span>
        <span className="mt-3 block text-sm font-semibold text-slate-700">
          Emergency fund ({months} months): <strong>{gbp(target)}</strong>
          {savings !== null ? (covered !== null && covered >= months ? ` · savings cover ${Math.floor(covered)} months ✓` : ` · ${gbp(Math.max(0, target - (savings || 0)))} to go`) : ""}
        </span>
      </span>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">What the household costs to run</h2>
          <p className="mt-1 text-sm text-slate-500">The essentials — what you&apos;d still have to pay if money got tight. Streaming, lotteries and savings aren&apos;t counted.</p>
        </div>
        <p className="text-right"><span className="block text-2xl font-black text-slate-950">{gbp(result.total)}<span className="text-sm font-bold text-slate-500">/mo</span></span><span className="text-xs font-semibold text-slate-500">{gbp(result.total * 12)} a year</span></p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {result.groups.map((group) => {
            const isOpen = open === group.key;
            const share = result.total > 0 ? (group.total / result.total) * 100 : 0;
            return (
              <li key={group.key}>
                <button type="button" onClick={() => setOpen(isOpen ? null : group.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">{group.label}</span>
                      <span className="text-sm font-black text-slate-950">{gbp(group.total)}/mo</span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(2, share)}%` }} /></span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {isOpen ? (
                  <ul className="space-y-1 px-3 pb-3 text-sm">
                    {group.lines.map((line, i) => {
                      const carSlot = group.key === "cars" ? cars.findIndex((car) => car.label === line.name) : -1;
                      return (
                        <li key={`${line.name}-${i}`} className="flex justify-between gap-3">
                          <span className="text-slate-600">
                            {carSlot >= 0 && onOpenCar ? <button type="button" onClick={() => onOpenCar(carSlot)} className="font-semibold text-indigo-700 underline-offset-2 hover:underline">{line.name}</button> : line.name}
                            {line.note ? <span className="block text-[11px] text-slate-400">{line.note}</span> : null}
                          </span>
                          <span className="font-semibold text-slate-900">{gbp(line.value)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>

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
      {cars.length ? <p className="mt-2 text-[11px] text-slate-400">Cars include Loop&apos;s estimates for fuel, insurance and servicing where you haven&apos;t entered your own figures.</p> : null}
    </section>
  );
}
