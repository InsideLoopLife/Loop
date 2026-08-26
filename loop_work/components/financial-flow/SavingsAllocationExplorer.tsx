"use client";

import { useMemo, useState } from "react";
import { PiggyBank, ShieldCheck } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { FinancialInstitutionLogo } from "@/components/savings/FinancialInstitutionLogo";

type Account = { id: string; name: string; provider: string; providerSlug?: string | null; balance: number };
type Pot = { id: string; name: string; allocated: number; target: number };
const SEGMENTS = ["#0f766e", "#2563eb", "#7c3aed", "#ea580c", "#0891b2", "#4f46e5", "#be123c", "#15803d"];
const clamp = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

function AccountAllocation({ accounts }: { accounts: Account[] }) {
  const total = accounts.reduce((sum, account) => sum + Math.max(0, account.balance), 0);
  const gradient = useMemo(() => {
    if (!(total > 0)) return "#e2e8f0";
    let cursor = 0;
    return `conic-gradient(${accounts.filter((a) => a.balance > 0).map((account, index) => {
      const start = cursor;
      cursor += account.balance / total * 100;
      return `${SEGMENTS[index % SEGMENTS.length]} ${start}% ${cursor}%`;
    }).join(",")})`;
  }, [accounts, total]);

  return <div>
    <div className="mx-auto grid h-44 w-44 place-items-center rounded-full" style={{ background: gradient }}>
      <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
        <div><p className="text-xl font-black text-slate-950">{formatMoney(total)}</p><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Across accounts</p></div>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      {accounts.filter((a) => a.balance > 0).sort((a,b) => b.balance-a.balance).map((account, index) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEGMENTS[index % SEGMENTS.length] }} /><FinancialInstitutionLogo provider={account.providerSlug || account.provider} className="h-7 w-7 rounded-lg" /><span className="truncate text-xs font-black text-slate-700">{account.name}</span></div>
        <span className="shrink-0 text-xs font-black text-slate-950">{formatMoney(account.balance)}</span>
      </div>)}
    </div>
  </div>;
}

function NeedsAllocation({ accounts, pots, committedMonthlySpend }: { accounts: Account[]; pots: Pot[]; committedMonthlySpend: number }) {
  const [months, setMonths] = useState<3 | 6>(3);
  const total = accounts.reduce((sum, account) => sum + Math.max(0, account.balance), 0);
  const emergencyTarget = Math.max(0, committedMonthlySpend) * months;
  const emergencyCovered = Math.min(total, emergencyTarget);
  const emergencyShortfall = Math.max(0, emergencyTarget - emergencyCovered);

  return <div className="space-y-3">
    <article className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-black text-slate-950">Emergency fund</p><p className="mt-1 text-xs font-semibold text-slate-500">Minimum safety view based on tracked committed monthly spending.</p></div></div>
        <div className="flex rounded-full bg-white p-1 shadow-sm">{([3,6] as const).map((value) => <button key={value} type="button" onClick={() => setMonths(value)} className={`rounded-full px-3 py-1 text-[10px] font-black ${months === value ? "bg-slate-950 text-white" : "text-slate-500"}`}>{value}m</button>)}</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">Target</p><p className="mt-1 font-black text-slate-950">{formatMoney(emergencyTarget)}</p></div>
        <div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">Available</p><p className="mt-1 font-black text-emerald-700">{formatMoney(emergencyCovered)}</p></div>
        <div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">Shortfall</p><p className={`mt-1 font-black ${emergencyShortfall > 0 ? "text-orange-700" : "text-emerald-700"}`}>{formatMoney(emergencyShortfall)}</p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${clamp(emergencyTarget > 0 ? emergencyCovered / emergencyTarget * 100 : 100)}%` }} /></div>
    </article>
    {pots.map((pot) => {
      const shortfall = Math.max(0, pot.target - pot.allocated);
      const pct = pot.target > 0 ? clamp(pot.allocated / pot.target * 100) : 100;
      return <article key={pot.id} className="rounded-2xl border border-slate-100 bg-white p-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><PiggyBank className="h-4 w-4 shrink-0 text-violet-600" /><span className="truncate text-xs font-black text-slate-700">{pot.name}</span></div><span className={`text-xs font-black ${shortfall > 0 ? "text-orange-700" : "text-emerald-700"}`}>{shortfall > 0 ? `${formatMoney(shortfall)} short` : "Covered"}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} /></div><p className="mt-1 text-[10px] font-bold text-slate-400">{formatMoney(pot.allocated)} of {formatMoney(pot.target)}</p></article>;
    })}
    {!pots.length ? <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs font-bold text-slate-400">No savings pots yet. The emergency-fund view still stays visible.</div> : null}
  </div>;
}

export function SavingsAllocationExplorer({ accounts, pots, committedMonthlySpend }: { accounts: Account[]; pots: Pot[]; committedMonthlySpend: number }) {
  const [mode, setMode] = useState<"accounts" | "needs">("accounts");
  return <div>
    <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Savings allocation</h2><p className="mt-1 text-sm font-semibold text-slate-500">{mode === "accounts" ? "Where the money actually sits today." : "What your savings need to cover and any shortfall."}</p></div><div className="flex rounded-full bg-slate-100 p-1"><button type="button" onClick={() => setMode("accounts")} className={`rounded-full px-3 py-1.5 text-[10px] font-black ${mode === "accounts" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Accounts</button><button type="button" onClick={() => setMode("needs")} className={`rounded-full px-3 py-1.5 text-[10px] font-black ${mode === "needs" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>Needs</button></div></div>
    <button type="button" onClick={() => setMode(mode === "accounts" ? "needs" : "accounts")} className="block w-full text-left" title="Toggle account allocation and savings needs">{mode === "accounts" ? <AccountAllocation accounts={accounts} /> : <NeedsAllocation accounts={accounts} pots={pots} committedMonthlySpend={committedMonthlySpend} />}</button>
  </div>;
}
