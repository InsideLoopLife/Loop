"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownRight, Banknote, Building2, CreditCard, Home, PiggyBank, Target, WalletCards } from "lucide-react";
import { formatMoney } from "@/lib/format/money";

export type IncomeFlowPerson = { id: string; name: string; avatarUrl?: string | null };
export type IncomeFlowLine = { key: string; label: string; amount: number; kind: "direct" | "other" };
export type IncomeFlowScope = { key: string; label: string; totalIncome: number; committedSpending: number; savingsTotal: number; leftoverCash: number; savingsRate: number; lines: IncomeFlowLine[] };

function pct(value: number, total: number) { return total > 0 ? `${Math.max(0, Math.round(value / total * 100))}%` : "0%"; }

function PersonToken({ person, selected }: { person: IncomeFlowPerson; selected: boolean }) {
  if (person.avatarUrl) return <img src={person.avatarUrl} alt="" className={`h-10 w-10 rounded-full object-cover ring-2 ${selected ? "ring-slate-950" : "ring-white"}`} />;
  return <span className={`grid h-10 w-10 place-items-center rounded-full text-sm font-black ring-2 ${selected ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200"}`}>{person.name.slice(0, 1).toUpperCase()}</span>;
}

function SourceIcon({ kind, label }: { kind: "direct" | "other"; label: string }) {
  const Icon = kind === "direct" ? Building2 : /benefit|hmrc|allowance/i.test(label) ? PiggyBank : Banknote;
  return <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${kind === "direct" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}><Icon className="h-5 w-5" /></span>;
}

function IncomeGroup({ title, copy, lines }: { title: string; copy: string; lines: IncomeFlowLine[] }) {
  if (!lines.length) return null;
  return <section>
    <div className="mb-2 flex items-end justify-between gap-3 px-1"><div><h3 className="text-sm font-black text-slate-950">{title}</h3><p className="text-xs font-semibold text-slate-500">{copy}</p></div><span className="text-xs font-black text-slate-400">{formatMoney(lines.reduce((sum, row) => sum + row.amount, 0))}</span></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {lines.map((row, index) => <div key={row.key} className={`flex items-center justify-between gap-4 px-4 py-3.5 ${index ? "border-t border-slate-100" : ""}`}><div className="flex min-w-0 items-center gap-3"><SourceIcon kind={row.kind} label={row.label} /><div className="min-w-0"><p className="truncate font-black text-slate-950">{row.label}</p><p className="text-[11px] font-bold text-slate-400">{row.kind === "direct" ? "Direct recurring income" : "Other household income"}</p></div></div><p className="shrink-0 text-base font-black text-slate-950">{formatMoney(row.amount)}</p></div>)}
    </div>
  </section>;
}

export function IncomeFlowScopeView({ month, people, scopes, initialScopeKey }: { month: string; people: IncomeFlowPerson[]; scopes: IncomeFlowScope[]; initialScopeKey: string }) {
  const [scopeKey, setScopeKey] = useState(scopes.some((scope) => scope.key === initialScopeKey) ? initialScopeKey : "all");
  const active = scopes.find((scope) => scope.key === scopeKey) || scopes.find((scope) => scope.key === "all") || scopes[0];
  const direct = useMemo(() => active?.lines.filter((line) => line.kind === "direct") || [], [active]);
  const other = useMemo(() => active?.lines.filter((line) => line.kind === "other") || [], [active]);
  const selectScope = (nextKey: string) => {
    setScopeKey(nextKey);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "income"); params.set("month", month);
    if (nextKey === "all") params.delete("people"); else params.set("people", nextKey);
    params.delete("person");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params.toString()}`);
  };
  if (!active) return null;
  return <div className="space-y-5">
    <div className="my-2 flex min-h-14 flex-wrap items-center gap-2 py-2" aria-label="Choose income profile">
      <button type="button" onClick={() => selectScope("all")} className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-black ${scopeKey === "all" ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}><Home className="h-4 w-4" /> Household</button>
      {people.map((person) => <button key={person.id} type="button" title={person.name} onClick={() => selectScope(person.id)} className="rounded-full p-1"><PersonToken person={person} selected={scopeKey === person.id} /></button>)}
    </div>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-[1.35rem] border border-emerald-100 bg-emerald-50/70 p-5"><p className="text-sm font-bold text-slate-500">Total monthly inflow</p><div className="mt-2 flex items-center justify-between"><p className="text-3xl font-black text-slate-950">{formatMoney(active.totalIncome)}</p><ArrowDownRight className="h-5 w-5 text-emerald-700" /></div><p className="mt-1 text-sm text-slate-500">After-tax income · {active.label}</p></article>
      <article className="rounded-[1.35rem] border border-orange-100 bg-orange-50/70 p-5"><p className="text-sm font-bold text-slate-500">Committed spending</p><div className="mt-2 flex items-center justify-between"><p className="text-3xl font-black text-slate-950">{formatMoney(active.committedSpending)}</p><CreditCard className="h-5 w-5 text-orange-700" /></div><p className="mt-1 text-sm text-slate-500">{pct(active.committedSpending, active.totalIncome)} of income</p></article>
      <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5"><p className="text-sm font-bold text-slate-500">Savings rate</p><div className="mt-2 flex items-center justify-between"><p className="text-3xl font-black text-slate-950">{Math.round(active.savingsRate)}%</p><Target className="h-5 w-5 text-emerald-700" /></div></article>
      <article className="rounded-[1.35rem] border border-sky-100 bg-sky-50/70 p-5"><p className="text-sm font-bold text-slate-500">Leftover cash</p><div className="mt-2 flex items-center justify-between"><p className="text-3xl font-black text-slate-950">{formatMoney(active.leftoverCash)}</p><WalletCards className="h-5 w-5 text-sky-700" /></div><p className="mt-1 text-sm text-slate-500">{pct(active.leftoverCash, active.totalIncome)} of income</p></article>
    </section>
    <section className="rounded-[1.35rem] border border-emerald-100 bg-emerald-50/40 p-5"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Income</p><h2 className="mt-1 text-xl font-black text-slate-950">This month&apos;s income</h2></div><Link href={`/income?month=${encodeURIComponent(month)}`} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Manage income</Link></div><div className="space-y-5"><IncomeGroup title="Direct income" copy="Salary, maternity pay and other recurring pay." lines={direct} /><IncomeGroup title="Other income" copy="Benefits, dividends, bonuses and manually logged income." lines={other} /></div></section>
  </div>;
}
