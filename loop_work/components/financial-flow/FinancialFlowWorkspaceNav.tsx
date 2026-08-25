"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  PiggyBank,
  Plus,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

export type FinancialFlowWorkspaceSection =
  | "flow"
  | "income"
  | "spending"
  | "savings";

const ITEMS: Array<{
  key: FinancialFlowWorkspaceSection;
  label: string;
  copy: string;
  icon: LucideIcon;
}> = [
  { key: "flow", label: "Overview", copy: "Your whole month", icon: ArrowRightLeft },
  { key: "income", label: "Income", copy: "Pay and money in", icon: Banknote },
  { key: "spending", label: "Spending", copy: "Bills and money out", icon: CreditCard },
  { key: "savings", label: "Savings & pots", copy: "Cash building forward", icon: PiggyBank },
];

function hrefFor(section: FinancialFlowWorkspaceSection, month?: string | null) {
  const monthSuffix = month ? `month=${encodeURIComponent(month)}` : "";
  if (section === "flow") return monthSuffix ? `/financial-flow?${monthSuffix}` : "/financial-flow";
  if (section === "income") return monthSuffix ? `/income?${monthSuffix}` : "/income";
  if (section === "spending") return monthSuffix ? `/spending?${monthSuffix}` : "/spending";
  const query = new URLSearchParams({ tab: "savings" });
  if (month) query.set("month", month);
  return `/financial-flow?${query.toString()}`;
}

export function FinancialFlowWorkspaceNav({
  section,
  month,
}: {
  section: FinancialFlowWorkspaceSection;
  month?: string | null;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.prefetch("/financial-flow");
      router.prefetch("/financial-flow?tab=savings");
      router.prefetch("/income");
      router.prefetch("/spending");
    }, 80);
    return () => window.clearTimeout(id);
  }, [router]);
  const monthQuery = month ? `&month=${encodeURIComponent(month)}` : "";

  return (
    <>
      <aside className="loop-financial-workspace-nav" aria-label="Financial Flow workspace">
        <div className="loop-flow-nav-card">
          <div className="loop-flow-nav-heading">
            <p>Financial Flow</p>
            <span>One money workspace</span>
          </div>

          <nav>
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.key === section;
              return (
                <Link
                  key={item.key}
                  href={hrefFor(item.key, month)}
                  prefetch
                  className={active ? "is-active" : ""}
                >
                  <span className="loop-flow-nav-icon"><Icon className="h-4 w-4" /></span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.copy}</small>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="loop-flow-nav-actions">
            <button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </button>
            <Link href={`/spending?add=bank_import${monthQuery}`}>
              <Upload className="h-4 w-4" /> Import bank
            </Link>
          </div>
        </div>
      </aside>

      {addOpen ? (
        <div className="fixed inset-0 z-[180] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <section className="w-full max-w-2xl rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Add to Financial Flow</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">What changed?</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Start with the simple action. Advanced timing, renewal and categorisation stays available after that.
                </p>
              </div>
              <button type="button" onClick={() => setAddOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link onClick={() => setAddOpen(false)} href={`/spending?add=monthly${monthQuery}`} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                <strong className="block text-slate-950">Regular payment</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">Bill, subscription, mortgage, transfer or recurring cost.</span>
              </Link>
              <Link onClick={() => setAddOpen(false)} href={`/spending?add=one_off${monthQuery}`} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                <strong className="block text-slate-950">One-off spending</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">Purchase, expense or something unusual this month.</span>
              </Link>
              <Link onClick={() => setAddOpen(false)} href={`/spending?add=child_cost${monthQuery}`} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                <strong className="block text-slate-950">Child cost</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">Nursery, wraparound, activities or childcare.</span>
              </Link>
              <Link onClick={() => setAddOpen(false)} href="/accounts?tab=add" className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                <strong className="block text-slate-950">Savings account</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">Add a saver, ISA, rate and regular contribution.</span>
              </Link>
              <Link onClick={() => setAddOpen(false)} href="/accounts?tab=pots" className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                <strong className="block text-slate-950">Pot or goal</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">Create a goal and add imagery, target and priority.</span>
              </Link>
              <Link onClick={() => setAddOpen(false)} href="/income" className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                <strong className="block text-slate-950">Income</strong>
                <span className="mt-1 block text-xs font-semibold text-slate-500">Salary, benefit, dividend or other money coming in.</span>
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
