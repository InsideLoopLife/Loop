"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History, Info } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import {
  movementDelta,
  movementDirection,
  savingsMonthSummary,
  type SavingsLedgerMovement,
} from "@/lib/wealth/savings-ledger";
import {
  estimateSavingsInterestForMonth,
  type SavingsInterestAccount,
} from "@/lib/wealth/savings-interest";
import { SavingsAccountModalShell } from "@/components/savings/SavingsAccountModalShell";

type Movement = SavingsLedgerMovement & {
  id: string;
  note?: string | null;
  source_type?: string | null;
};

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return monthKey(date);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function movementLabel(value: string) {
  return String(value || "movement")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateLabel(value?: string | null) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function SavingsActivityThread({
  account,
  accountName,
  movements,
}: {
  account: SavingsInterestAccount;
  accountName: string;
  movements: Movement[];
}) {
  const latestMovementMonth = movements
    .map((movement) => String(movement.effective_at || movement.created_at || "").slice(0, 7))
    .filter(Boolean)
    .sort()
    .at(-1);
  const [selectedMonth, setSelectedMonth] = useState(latestMovementMonth || monthKey());

  const availableMonths = useMemo(() => {
    const keys = new Set<string>([monthKey(), selectedMonth]);
    for (const movement of movements) {
      const key = String(movement.effective_at || movement.created_at || "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(key)) keys.add(key);
    }
    return Array.from(keys).sort();
  }, [movements, selectedMonth]);

  const rows = useMemo(
    () => movements
      .filter((movement) => String(movement.effective_at || movement.created_at || "").slice(0, 7) === selectedMonth)
      .sort((a, b) => String(b.effective_at || b.created_at || "").localeCompare(String(a.effective_at || a.created_at || ""))),
    [movements, selectedMonth],
  );
  const movementSummary = savingsMonthSummary(movements, selectedMonth);
  const interestEstimate = estimateSavingsInterestForMonth([account], movements, selectedMonth);
  const accountInterest = interestEstimate.rows[0];
  const earliest = availableMonths[0];
  const latest = availableMonths.at(-1) || selectedMonth;

  return (
    <SavingsAccountModalShell
      title={`${accountName} activity thread`}
      subtitle="Deposits, withdrawals, confirmed interest, fees and balance corrections are kept in one dated ledger. Unconfirmed interest is shown separately as an estimate."
      triggerClassName="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
      trigger={<><History className="h-4 w-4" />Thread</>}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))}
          disabled={selectedMonth <= earliest}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Activity month</p>
          <p className="mt-1 text-xl font-black text-slate-950">{monthLabel(selectedMonth)}</p>
        </div>
        <button
          type="button"
          onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))}
          disabled={selectedMonth >= latest}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-35"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Put in</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(movementSummary.in)}</p>
        </div>
        <div className="rounded-3xl bg-orange-50 p-4 ring-1 ring-orange-100">
          <p className="text-xs font-black uppercase tracking-wide text-orange-700">Taken out</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(movementSummary.out)}</p>
        </div>
        <div className="rounded-3xl bg-blue-50 p-4 ring-1 ring-blue-100">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Interest gained</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(interestEstimate.total)}</p>
          <p className="mt-1 text-[11px] font-black text-blue-700/75">Provider paid {formatMoney(interestEstimate.providerConfirmed)} · accrued through yesterday {formatMoney(interestEstimate.accruedThroughYesterday)} · today est. {formatMoney(interestEstimate.estimated)}</p>
        </div>
      </div>

      {accountInterest && (accountInterest.estimatedInterest > 0 || accountInterest.annualRate > 0) ? (
        <article className="mt-5 rounded-3xl border border-blue-200 bg-blue-50/80 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-black text-blue-950"><Info className="h-4 w-4" />Interest accrual status</p>
              <p className="mt-1 text-xs font-bold leading-5 text-blue-900/70">{accountInterest.label}</p>
              {accountInterest.estimateFrom && accountInterest.estimateTo ? <p className="mt-1 text-[11px] font-bold text-blue-800/65">Estimated for {dateLabel(accountInterest.estimateFrom)} to {dateLabel(accountInterest.estimateTo)} using {accountInterest.annualRate.toFixed(2)}% AER.</p> : null}
            </div>
            <div className="text-right">
              {accountInterest.accrualFrequency === "daily" ? <p className="text-xs font-black text-blue-700">{formatMoney(accountInterest.dailyEstimate)}/day</p> : null}
              <p className="mt-1 text-sm font-black text-blue-950">Accrued through yesterday: {formatMoney(accountInterest.accruedThroughYesterday)}</p>
              <p className="mt-1 text-xl font-black text-blue-950">Today est. +{formatMoney(accountInterest.estimatedInterest)}</p>
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-700/65">provider-paid interest replaces modelled accrual</p>
            </div>
          </div>
        </article>
      ) : null}

      <div className="mt-5 space-y-3">
        {rows.map((movement) => {
          const direction = movementDirection(movement);
          const delta = movementDelta(movement);
          const amountLabel = direction === "out" ? `-${formatMoney(Math.abs(delta))}` : direction === "neutral" ? formatMoney(movement.amount) : `+${formatMoney(Math.abs(delta))}`;
          return (
            <article key={movement.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black text-slate-950">{movementLabel(movement.movement_type)}</p>{movement.source_type === "scheduled_top_up" ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Scheduled</span> : null}{movement.source_type === "modelled_interest" ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700">Modelled</span> : null}</div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{dateLabel(movement.effective_at || movement.created_at)}</p>
                </div>
                <p className={`text-lg font-black ${direction === "out" ? "text-orange-700" : direction === "interest" ? "text-blue-700" : "text-emerald-700"}`}>{amountLabel}</p>
              </div>
              {movement.previous_balance != null || movement.resulting_balance != null ? (
                <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  {movement.previous_balance != null ? `Before ${formatMoney(movement.previous_balance)}` : ""}
                  {movement.previous_balance != null && movement.resulting_balance != null ? " → " : ""}
                  {movement.resulting_balance != null ? `After ${formatMoney(movement.resulting_balance)}` : ""}
                </p>
              ) : null}
              {movement.note ? <p className="mt-2 text-sm font-semibold text-slate-500">{movement.note}</p> : null}
            </article>
          );
        })}
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
            No ledger movement was logged in {monthLabel(selectedMonth)}. Daily accounts can still show completed-day accrual and today&apos;s estimate above.
          </div>
        ) : null}
      </div>
    </SavingsAccountModalShell>
  );
}
