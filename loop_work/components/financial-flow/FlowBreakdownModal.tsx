"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";

type FlowLine = {
  key: string;
  label: string;
  amount: number;
  tone?: "orange" | "green" | "blue" | "slate";
  href?: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

function toneClasses(tone?: FlowLine["tone"]) {
  if (tone === "green") return "bg-emerald-50 text-emerald-800 border-emerald-100";
  if (tone === "blue") return "bg-sky-50 text-sky-800 border-sky-100";
  if (tone === "orange") return "bg-orange-50 text-orange-800 border-orange-100";
  return "bg-slate-50 text-slate-800 border-slate-100";
}

export function FlowBreakdownModal({
  trigger,
  title,
  month,
  rows,
  editHref,
  large = false,
}: {
  trigger: ReactNode;
  title: string;
  month: string;
  rows: FlowLine[];
  editHref?: string;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<string>("all");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const tabs = useMemo(() => ["all", ...Array.from(new Set(rows.map((row) => row.label))).slice(0, 8)], [rows]);
  const filteredRows = tab === "all" ? rows : rows.filter((row) => row.label === tab);
  const total = filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const max = Math.max(1, ...filteredRows.map((row) => Math.abs(Number(row.amount || 0))));

  const modal = open ? (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
      <section className={`relative w-full ${large ? "max-w-[1500px]" : "max-w-5xl"} max-h-[92vh] overflow-hidden rounded-[2.2rem] border border-white/80 bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-slate-50 via-white to-emerald-50 p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Flow evidence · {month}</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">{title}</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">This is what Loop is including in the selected month. Use edit to correct categories, amounts, visibility or recurrence.</p>
          </div>
          <div className="flex items-center gap-2">
            {editHref ? <Link href={editHref} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Edit source</Link> : null}
            <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="max-h-[76vh] overflow-y-auto p-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {tabs.map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-xs font-black ${tab === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{item === "all" ? "All lines" : item}</button>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <button key={row.key} type="button" className={`grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border p-4 text-left ${toneClasses(row.tone)}`}>
                  <div>
                    <p className="font-black">{row.label}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80"><span className="block h-full rounded-full bg-current opacity-40" style={{ width: `${Math.max(3, Math.round((Math.abs(row.amount) / max) * 100))}%` }} /></div>
                  </div>
                  <p className="text-lg font-black">{formatMoney(row.amount)}</p>
                </button>
              ))}
              {!filteredRows.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-400">No source rows found for this tab.</p> : null}
            </div>
            <aside className="rounded-[1.8rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Included total</p>
              <p className="mt-2 text-4xl font-black text-slate-950">{formatMoney(total)}</p>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-500">If this total looks too high, check for duplicate planned transfers and account top-ups. Loop now suppresses linked savings-transfer duplication, but manual rows can still be corrected here.</p>
              {editHref ? <Link href={editHref} className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 ring-1 ring-slate-200">Open edit page</Link> : null}
            </aside>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="contents">{trigger}</button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
