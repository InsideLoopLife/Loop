"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format/money";

export type PensionFundRow = {
  id: string;
  name: string;
  providerLabel: string;
  value: number;
  unitPrice: number | null;
  priceAsOfDate: string | null;
  changeSincePriceCheck: { gbp: number; percent: number; checkedAt: string } | null;
};

type Range = "1w" | "1m" | "1y" | "5y";
const RANGES: { value: Range; label: string }[] = [
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
];

function unitPriceLabel(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}p`;
}

function signedGbp(value: number) {
  const label = formatMoney(Math.abs(value));
  if (value === 0) return label;
  return `${value > 0 ? "+" : "-"}${label}`;
}

function signedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function providerInitials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

// Fixed, non-cycled palette so a provider keeps the same color everywhere it
// appears (ticker, allocation bar, detail card) — matches the investments
// dashboard's diversification chart convention.
const PROVIDER_PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948"];

export function PensionPerformanceOverview({
  totalValue,
  monthlyTopUp,
  monthlyFees,
  funds,
}: {
  totalValue: number;
  monthlyTopUp: number;
  monthlyFees: number;
  funds: PensionFundRow[];
}) {
  const [activeFundId, setActiveFundId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("1y");

  const activeFund = activeFundId ? funds.find((fund) => fund.id === activeFundId) ?? null : null;
  const providers = Array.from(new Set(funds.map((fund) => fund.providerLabel)));
  const providerColor = (label: string) => PROVIDER_PALETTE[providers.indexOf(label) % PROVIDER_PALETTE.length];

  const allocation = providers
    .map((label) => ({
      label,
      value: funds.filter((fund) => fund.providerLabel === label).reduce((sum, fund) => sum + fund.value, 0),
    }))
    .sort((a, b) => b.value - a.value)
    .map((row) => ({ ...row, percent: totalValue > 0 ? (row.value / totalValue) * 100 : 0 }));

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {activeFund ? (
            <>
              <button
                type="button"
                onClick={() => setActiveFundId(null)}
                className="mb-1 flex items-center gap-1 text-xs font-black text-slate-500 hover:text-slate-800"
              >
                ‹ All funds
              </button>
              <p className="text-sm font-bold text-slate-500">{activeFund.name}</p>
              <p className="mt-2 text-3xl font-black">{formatMoney(activeFund.value)}</p>
              <p className="mt-1 text-xs font-bold text-slate-400">
                {unitPriceLabel(activeFund.unitPrice)} per unit · {activeFund.providerLabel}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-slate-500">Total pension value</p>
              <p className="mt-2 text-3xl font-black">{formatMoney(totalValue)}</p>
              <p className="mt-1 text-xs font-bold text-slate-400">
                Across {funds.length} fund{funds.length === 1 ? "" : "s"} and {providers.length} provider{providers.length === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-black transition ${
                range === r.value ? "bg-orange-100 text-orange-700" : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart placeholder: intentionally not drawing a line yet. Real price
          history (per fund and rolled up to the total) isn't backfilled yet —
          showing a fabricated line here would repeat the exact mistake found
          and fixed on the investments side. Swap this block for a real chart
          once fund price history is populated. */}
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center">
        <p className="text-xs font-bold text-slate-500">
          Not enough price history yet to chart {activeFund ? activeFund.name : "pension performance"}
        </p>
        <p className="mt-1 text-xs text-slate-400">This fills in automatically once fund prices have been tracked for a while</p>
      </div>

      <p className="mt-5 mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Funds</p>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {funds.map((fund) => {
          const active = fund.id === activeFundId;
          return (
            <button
              type="button"
              key={fund.id}
              onClick={() => setActiveFundId(active ? null : fund.id)}
              className={`min-w-[168px] shrink-0 rounded-2xl border px-3.5 py-3 text-left transition ${
                active ? "border-orange-300 bg-orange-50" : "border-transparent bg-slate-50 hover:border-slate-200"
              }`}
            >
              <p className="truncate text-xs font-bold text-slate-500">{fund.name}</p>
              <p className="mt-1 text-base font-black text-slate-950">{unitPriceLabel(fund.unitPrice)}</p>
              {fund.changeSincePriceCheck ? (
                <p className={`mt-0.5 text-xs font-bold ${fund.changeSincePriceCheck.percent >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {signedPercent(fund.changeSincePriceCheck.percent)} since last check
                </p>
              ) : (
                <p className="mt-0.5 text-xs font-bold text-slate-400">No data yet</p>
              )}
            </button>
          );
        })}
      </div>

      {allocation.length > 0 ? (
        <>
          <p className="mt-5 mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Allocation by provider</p>
          <div className="flex flex-col gap-2">
            {allocation.map((row) => (
              <div key={row.label}>
                <div className="mb-1 flex justify-between text-xs font-bold">
                  <span className="text-slate-700">{row.label}</span>
                  <span className="text-slate-400">{row.percent.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${row.percent}%`, background: providerColor(row.label) }} />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <p className="mt-5 mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Funds detail</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {funds.map((fund) => {
          const active = fund.id === activeFundId;
          return (
            <button
              type="button"
              key={fund.id}
              onClick={() => setActiveFundId(active ? null : fund.id)}
              className={`rounded-2xl border px-4 py-3.5 text-left transition ${
                active ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                  style={{ background: providerColor(fund.providerLabel) }}
                >
                  {providerInitials(fund.providerLabel)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{fund.name}</p>
                  <p className="truncate text-xs font-bold text-slate-400">{fund.providerLabel}</p>
                </div>
              </div>
              <p className="mt-2.5 text-xl font-black">{formatMoney(fund.value)}</p>
              <p className={`mt-0.5 text-xs font-bold ${fund.changeSincePriceCheck ? (fund.changeSincePriceCheck.percent >= 0 ? "text-emerald-700" : "text-red-700") : "text-slate-400"}`}>
                {unitPriceLabel(fund.unitPrice)} / unit
                {fund.changeSincePriceCheck ? ` · ${signedPercent(fund.changeSincePriceCheck.percent)}` : " · no data yet"}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold text-slate-500">Fixed monthly top-up</p>
          <p className="mt-1 text-lg font-black">{formatMoney(monthlyTopUp)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500">Estimated monthly fees</p>
          <p className="mt-1 text-lg font-black">{formatMoney(monthlyFees)}</p>
        </div>
      </div>
    </div>
  );
}
