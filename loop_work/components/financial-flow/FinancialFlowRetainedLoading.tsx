"use client";

import { FinancialFlowWorkspaceNav } from "@/components/financial-flow/FinancialFlowWorkspaceNav";
import { useFinancialFlowRetained, type RetainedFlowSection } from "@/components/financial-flow/FinancialFlowRetainedStore";
import { SavingsFlowDetail, type SavingsFlowAccountRow, type SavingsFlowPotRow, type SavingsFlowTrendPoint, type SavingsFlowYearMonth } from "@/components/financial-flow/SavingsFlowDetail";
import { SpendingPlannerDeferredClient } from "@/components/spending/SpendingPlannerDeferredClient";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { formatMoney } from "@/lib/format/money";

export function FinancialFlowRetainedLoading({
  fallbackSection,
}: {
  fallbackSection: RetainedFlowSection;
}) {
  const retained = useFinancialFlowRetained();
  const section = retained.intendedSection || fallbackSection;
  const month = retained.intendedMonth || retained.summary?.month || null;

  if (section === "spending" && retained.spending) {
    return (
      <>
        <FinancialFlowWorkspaceNav section="spending" month={month} />
        <div className="pointer-events-none opacity-[0.97]" aria-busy="true">
          <div className="mx-auto w-[95vw] max-w-[2000px] px-4 pt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Updating changed spending data…
          </div>
          <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-4">
            <SpendingPlannerDeferredClient {...(retained.spending as any)} />
          </main>
        </div>
      </>
    );
  }

  if (section === "savings" && retained.savings) {
    const props = retained.savings as {
      monthKey: string;
      scopeSavingsPercent: number;
      scopeSavingsLabel: string;
      blendedRate: number;
      providerConfirmedInterest: number;
      accruedThroughYesterday: number;
      estimatedInterest: number;
      unassignedEquity: number;
      totalSavings: number;
      earmarkedToPots: number;
      accounts: SavingsFlowAccountRow[];
      pots: SavingsFlowPotRow[];
      trend: SavingsFlowTrendPoint[];
      yearMonths: SavingsFlowYearMonth[];
      healthScore: number;
      marketStatus: "healthy" | "partial" | "unavailable";
      annualOpportunity: number;
      scopePersonIds?: string[];
      committedMonthlySpend: number;
    };
    return (
      <>
        <FinancialFlowWorkspaceNav section="savings" month={props.monthKey || month} />
        <div className="pointer-events-none opacity-[0.97]" aria-busy="true">
          <div className="mx-auto w-[95vw] max-w-[2000px] px-4 pt-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Updating changed savings data…
          </div>
          <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-4">
            <SavingsFlowDetail {...props} />
          </main>
        </div>
      </>
    );
  }

  if (retained.summary) {
    const summary = retained.summary;
    const label = section === "flow" ? "Overview" : section[0].toUpperCase() + section.slice(1);
    return (
      <>
        <FinancialFlowWorkspaceNav section={section} month={summary.month} />
        <main className="mx-auto w-[95vw] max-w-[2000px] space-y-4 px-4 py-5">
          <section className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm" aria-busy="true">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Financial Flow · {label}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black text-slate-950">Your retained {summary.month} picture</h1>
                <p className="mt-1 text-sm font-semibold text-slate-500">The layout and known month totals stay in place while LOOP checks only what changed.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">Refreshing changed data…</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Income", summary.income],
                ["Spending", summary.spending],
                ["Savings", summary.savings],
                ["Available", summary.available],
              ].map(([name, value]) => (
                <article key={String(name)} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{name}</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{formatMoney(Number(value))}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      </>
    );
  }

  return <WealthRouteSkeleton label="financial flow" />;
}
