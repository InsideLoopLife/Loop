"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateSavingsAccruedBalance, type SavingsAccrualInput } from "@/lib/wealth/savings-accrual";

function formatGbp(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatGbpPence(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function shortDate(value?: string | null) {
  if (!value) return "not confirmed yet";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "not confirmed yet";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function SavingsLiveBalance({ account, ledgerBalance }: { account: SavingsAccrualInput; ledgerBalance?: number | null }) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const accrual = useMemo(() => calculateSavingsAccruedBalance(account, new Date(tick)), [account, tick]);
  const positiveInterest = accrual.interestAccrued > 0.004;
  const displayedBalance = ledgerBalance != null && Number.isFinite(Number(ledgerBalance))
    ? Math.max(accrual.estimatedBalance, Number(ledgerBalance))
    : accrual.estimatedBalance;

  return (
    <div>
      <p className="text-xl font-black text-slate-950">{formatGbp(displayedBalance)}</p>
      <p className="mt-1 text-[11px] font-black text-slate-500">
        {positiveInterest ? `${formatGbpPence(accrual.interestAccrued)} est. interest since ${shortDate(accrual.lastConfirmedAt)}` : `Base confirmed ${shortDate(accrual.lastConfirmedAt)}`}{displayedBalance > accrual.estimatedBalance + 0.004 ? " · due top-ups included" : ""}
      </p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{accrual.label}</p>
    </div>
  );
}
