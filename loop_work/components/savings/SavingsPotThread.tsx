"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MessageCircle, X } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { SubmitButton } from "@/components/SubmitButton";

export type SavingsPotMovementRow = {
  id: string;
  savings_pot_id: string;
  amount: number;
  movement_type: string;
  effective_at: string | null;
  note?: string | null;
};

export function SavingsPotThread({
  potId,
  potName,
  movements,
  action,
}: {
  potId: string;
  potName: string;
  movements: SavingsPotMovementRow[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => [...movements].sort((a, b) => String(b.effective_at || "").localeCompare(String(a.effective_at || ""))), [movements]);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Open pot activity thread" className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200"><MessageCircle className="h-5 w-5" /></button>
      {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-label={`${potName} activity thread`} className="w-full max-w-2xl rounded-[2rem] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Savings pot</p><h2 className="mt-1 text-2xl font-black text-slate-950">{potName} thread</h2><p className="mt-1 text-sm font-semibold text-slate-500">Record the amount allocated to or removed from this goal each month.</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button></div><div className="mt-5 rounded-3xl bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Net threaded allocation</p><p className="mt-1 text-3xl font-black text-slate-950">{formatMoney(total)}</p></div><form action={action} className="mt-5 grid gap-3 rounded-3xl border border-slate-200 p-4 sm:grid-cols-2"><input type="hidden" name="savings_pot_id" value={potId} /><label className="text-xs font-black uppercase tracking-wide text-slate-500">Movement<select name="movement_type" className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950"><option value="allocation">Allocated to pot</option><option value="deallocation">Removed from pot</option><option value="correction">Balance correction</option></select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Amount<input name="amount" type="number" min="0.01" step="0.01" required className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black" /></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Date<input name="effective_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black" /></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Note<input name="note" placeholder="July contribution" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" /></label><SubmitButton pendingLabel="Adding…" className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-black text-white sm:col-span-2">Add to thread</SubmitButton></form><div className="mt-5 max-h-72 space-y-2 overflow-y-auto">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-slate-500"><CalendarDays className="h-4 w-4" /></span><div><p className="text-sm font-black text-slate-950">{row.movement_type === "deallocation" ? "Removed" : row.movement_type === "correction" ? "Correction" : "Allocated"}</p><p className="text-xs font-semibold text-slate-500">{row.effective_at || "No date"}{row.note ? ` · ${row.note}` : ""}</p></div></div><p className={`font-black ${row.amount < 0 ? "text-orange-700" : "text-emerald-700"}`}>{row.amount < 0 ? "-" : "+"}{formatMoney(Math.abs(row.amount))}</p></div>)}{!rows.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm font-semibold text-slate-400">No threaded allocations yet.</p> : null}</div></section></div> : null}
    </>
  );
}
